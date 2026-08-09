type SupabaseClient = any;

type WhereOp = '==' | 'in' | 'not-in' | '>=' | '<=' | '>' | '<' | 'array-contains' | 'array-contains-any';

type FieldValueMarker =
  | { __kind: 'serverTimestamp' }
  | { __kind: 'increment'; value: number }
  | { __kind: 'arrayUnion'; values: any[] };

type FirestoreConstraint =
  | { type: 'where'; field: string; op: WhereOp; value: any }
  | { type: 'orderBy'; field: string; direction: 'asc' | 'desc' }
  | { type: 'limit'; count: number };

type FirestoreRef = {
  kind: 'collection' | 'doc' | 'query';
  table: string;
  id?: string;
  orderId?: string;
  itemId?: string;
  path: string;
  constraints?: FirestoreConstraint[];
};

type SnapshotDoc = {
  id: string;
  ref: any;
  data: () => any;
  exists: () => boolean;
};

type SnapshotQuery = {
  docs: SnapshotDoc[];
  size: number;
  empty: boolean;
  forEach: (callback: (doc: SnapshotDoc) => void) => void;
};

let globalSupabaseClient: SupabaseClient;

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toIsoTimestamp(): string {
  return new Date().toISOString();
}

function isFieldValueMarker(value: any): value is FieldValueMarker {
  return Boolean(value && typeof value === 'object' && typeof value.__kind === 'string');
}

function serverTimestamp(): FieldValueMarker {
  return { __kind: 'serverTimestamp' };
}

function increment(value: number): FieldValueMarker {
  return { __kind: 'increment', value };
}

function arrayUnion(...values: any[]): FieldValueMarker {
  return { __kind: 'arrayUnion', values };
}

function parsePath(input: string): string[] {
  return input.split('/').filter(Boolean);
}

function mapCollectionPathToTable(path: string): { table: string; orderId?: string } {
  const parts = parsePath(path);

  // orders/{orderId}/items/{itemId}/revisions
  if (parts.length >= 5 && parts[0] === 'orders' && parts[2] === 'items') {
    if (parts[4] === 'revisions') return { table: 'design_revisions', orderId: parts[1] };
    if (parts[4] === 'proofs') return { table: 'design_proofs', orderId: parts[1] };
    if (parts[4] === 'comments') return { table: 'design_comments', orderId: parts[1] };
  }

  if (parts.length >= 3 && parts[0] === 'orders' && parts[2] === 'items') {
    return { table: 'order_items', orderId: parts[1] };
  }

  if (parts[0] === 'bankAccounts') {
    return { table: 'bankAccounts' };
  }

  if (parts[0] === 'payments') {
    return { table: 'payment' };
  }

  return { table: parts[0] };
}

function buildDocPath(parts: string[]): { table: string; id?: string; orderId?: string } {
  // orders/{orderId}/items/{itemId}/revisions/{revisionId}
  if (parts.length >= 6 && parts[0] === 'orders' && parts[2] === 'items') {
    if (parts[4] === 'revisions') return { table: 'design_revisions', orderId: parts[1], id: parts[5] };
    if (parts[4] === 'proofs') return { table: 'design_proofs', orderId: parts[1], id: parts[5] };
    if (parts[4] === 'comments') return { table: 'design_comments', orderId: parts[1], id: parts[5] };
  }

  if (parts.length >= 4 && parts[0] === 'orders' && parts[2] === 'items') {
    return { table: 'order_items', orderId: parts[1], id: parts[3] };
  }

  if (parts.length >= 2) {
    if (parts[0] === 'payments') {
      return { table: 'payment', id: parts[1] };
    }
    return { table: parts[0], id: parts[1] };
  }

  return { table: parts[0] };
}

function makeCollectionRef(path: string): FirestoreRef {
  const mapped = mapCollectionPathToTable(path);
  const parts = parsePath(path);
  const itemId = (parts.length >= 4 && parts[0] === 'orders' && parts[2] === 'items') ? parts[3] : undefined;
  return {
    kind: 'collection',
    table: mapped.table,
    orderId: mapped.orderId,
    itemId,
    path,
  };
}

function makeDocRef(path: string): FirestoreRef {
  const parts = parsePath(path);
  const mapped = buildDocPath(parts);
  const itemId = (parts.length >= 4 && parts[0] === 'orders' && parts[2] === 'items') ? parts[3] : undefined;
  return {
    kind: 'doc',
    table: mapped.table,
    id: mapped.id,
    orderId: mapped.orderId,
    itemId,
    path,
  };
}

function collection(_db: any, ...segments: string[]): FirestoreRef {
  return makeCollectionRef(segments.join('/'));
}

function doc(_db: any, ...segments: string[]): FirestoreRef {
  return makeDocRef(segments.join('/'));
}

function where(field: string, op: WhereOp, value: any): FirestoreConstraint {
  return { type: 'where', field, op, value };
}

function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FirestoreConstraint {
  return { type: 'orderBy', field, direction };
}

function limit(count: number): FirestoreConstraint {
  return { type: 'limit', count };
}

function query(base: FirestoreRef, ...constraints: FirestoreConstraint[]): FirestoreRef {
  return {
    ...base,
    kind: 'query',
    constraints: [...(base.constraints || []), ...constraints]
  };
}

function getPathValue(row: any, field: string): any {
  if (!field.includes('.')) {
    return row?.[field];
  }

  const [root, ...rest] = field.split('.');
  let current = row?.[root];
  for (const segment of rest) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function applyMarker(existing: any, value: any): any {
  if (!isFieldValueMarker(value)) return value;

  if (value.__kind === 'serverTimestamp') {
    return toIsoTimestamp();
  }

  if (value.__kind === 'increment') {
    const base = typeof existing === 'number' ? existing : 0;
    return base + value.value;
  }

  if (value.__kind === 'arrayUnion') {
    const base = Array.isArray(existing) ? existing : [];
    const next = [...base];
    for (const item of value.values) {
      if (!next.some((candidate) => JSON.stringify(candidate) === JSON.stringify(item))) {
        next.push(item);
      }
    }
    return next;
  }

  return value;
}

function setDeep(target: any, key: string, value: any) {
  if (!key.includes('.')) {
    target[key] = value;
    return;
  }

  const [root, ...rest] = key.split('.');
  if (!target[root] || typeof target[root] !== 'object') {
    target[root] = {};
  }

  let current = target[root];
  for (let index = 0; index < rest.length - 1; index += 1) {
    const segment = rest[index];
    if (!current[segment] || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    current = current[segment];
  }

  current[rest[rest.length - 1]] = value;
}

function normalizePayload(payload: Record<string, any>, existing: any = {}, table?: string): any {
  const next = { ...(existing || {}) };

  // order_items: strict whitelist — only write columns that exist in the real table
  if (table === 'order_items') {
    // All real columns in order_items (from all migrations):
    const validColumns = new Set([
      'id', 'order_id', 'status',
      'productName', 'description', 'designType', 'itemWorkspace',
      'tiff_path', 'tiff_assigned_at', 'tiff_assigned_by',
      'assignedPrinterId', 'assignedPrinterName',
    ]);
    // camelCase → snake_case mappings for columns that need it
    const camelToSnake: Record<string, string> = {
      tiffPath: 'tiff_path',
      tiffAssignedAt: 'tiff_assigned_at',
      tiffAssignedBy: 'tiff_assigned_by',
      orderId: 'order_id',
    };
    // Start from existing (only keep valid columns already fetched from DB)
    const out: Record<string, any> = {};
    for (const col of validColumns) {
      if (existing && col in existing) out[col] = existing[col];
    }

    // Ensure itemWorkspace is a valid object
    let workspace = out['itemWorkspace'] || {};
    if (typeof workspace === 'string') {
      try {
        workspace = JSON.parse(workspace);
      } catch {
        workspace = {};
      }
    }
    out['itemWorkspace'] = { ...workspace };

    // Apply incoming payload updates
    for (const [key, value] of Object.entries(payload)) {
      if (key.startsWith('itemWorkspace.')) {
        const subKey = key.split('.')[1];
        out['itemWorkspace'][subKey] = applyMarker(out['itemWorkspace'][subKey], value);
      } else {
        const mapped = camelToSnake[key] ?? key;
        if (validColumns.has(mapped)) {
          out[mapped] = applyMarker(out[mapped], value);
        } else {
          // Store arbitrary properties inside itemWorkspace JSONB column
          out['itemWorkspace'][key] = applyMarker(out['itemWorkspace'][key], value);
        }
      }
    }
    return out;
  }

  // For known design studio tables with strict schema, let's map camelCase to snake_case and keep only valid columns
  if (table === 'design_revisions') {
    const validColumns = new Set([
      'id', 'order_id', 'item_id', 'version', 'url',
      'cloudinary_public_id', 'cloudinary_folder', 'uploaded_by',
      'uploaded_by_name', 'uploaded_at', 'notes', 'revision_type',
      'upload_stats', 'created_at'
    ]);
    const mappedPayload: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      let mappedKey = key;
      if (key === 'uploadedBy') mappedKey = 'uploaded_by';
      if (key === 'uploadedByName') mappedKey = 'uploaded_by_name';
      if (key === 'uploadedAt') mappedKey = 'uploaded_at';
      if (key === 'revisionType') mappedKey = 'revision_type';
      if (key === 'uploadStats') mappedKey = 'upload_stats';
      if (key === 'cloudinaryPublicId') mappedKey = 'cloudinary_public_id';
      if (key === 'cloudinaryFolder') mappedKey = 'cloudinary_folder';

      if (validColumns.has(mappedKey)) {
        mappedPayload[mappedKey] = applyMarker(existing[mappedKey], value);
      } else if (key === 'filename') {
        // filename is not a column, merge it into upload_stats
        if (!mappedPayload.upload_stats) mappedPayload.upload_stats = { ...(existing.upload_stats || {}) };
        mappedPayload.upload_stats.filename = value;
      }
    }
    return { ...next, ...mappedPayload };
  }

  if (table === 'design_proofs') {
    const validColumns = new Set([
      'id', 'order_id', 'item_id', 'version', 'revision_version', 'url',
      'cloudinary_public_id', 'sent_at', 'sent_by', 'sent_by_name',
      'customer_response', 'response_at', 'rejection_reason', 'notes', 'created_at'
    ]);
    const mappedPayload: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      let mappedKey = key;
      if (key === 'revisionVersion') mappedKey = 'revision_version';
      if (key === 'cloudinaryPublicId') mappedKey = 'cloudinary_public_id';
      if (key === 'sentAt') mappedKey = 'sent_at';
      if (key === 'sentBy') mappedKey = 'sent_by';
      if (key === 'sentByName') mappedKey = 'sent_by_name';
      if (key === 'customerResponse') mappedKey = 'customer_response';
      if (key === 'responseAt') mappedKey = 'response_at';
      if (key === 'rejectionReason') mappedKey = 'rejection_reason';

      if (validColumns.has(mappedKey)) {
        mappedPayload[mappedKey] = applyMarker(existing[mappedKey], value);
      }
    }
    return { ...next, ...mappedPayload };
  }

  if (table === 'design_comments') {
    const validColumns = new Set([
      'id', 'order_id', 'item_id', 'message', 'author_id', 'author_name',
      'author_role', 'attachment_url', 'created_at'
    ]);
    const mappedPayload: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      let mappedKey = key;
      if (key === 'authorId') mappedKey = 'author_id';
      if (key === 'authorName') mappedKey = 'author_name';
      if (key === 'authorRole') mappedKey = 'author_role';
      if (key === 'attachmentUrl') mappedKey = 'attachment_url';

      if (validColumns.has(mappedKey)) {
        mappedPayload[mappedKey] = applyMarker(existing[mappedKey], value);
      }
    }
    return { ...next, ...mappedPayload };
  }
  if (table === 'notifications') {
    const validColumns = new Set([
      'id', 'user_id', 'title', 'body', 'status', 'metadata', 'created_at', 'updated_at'
    ]);
    const mappedPayload: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      let mappedKey = key;
      if (key === 'userId') mappedKey = 'user_id';
      if (key === 'message') mappedKey = 'body';
      if (key === 'createdAt') mappedKey = 'created_at';
      if (key === 'updatedAt') mappedKey = 'updated_at';
      if (key === 'read') {
        mappedPayload['status'] = value ? 'READ' : 'UNREAD';
        continue;
      }

      if (validColumns.has(mappedKey)) {
        mappedPayload[mappedKey] = applyMarker(existing[mappedKey], value);
      } else {
        if (!mappedPayload.metadata) mappedPayload.metadata = { ...(existing.metadata || {}) };
        mappedPayload.metadata[key] = applyMarker(existing.metadata?.[key], value);
      }
    }
    return { ...next, ...mappedPayload };
  }

  for (const [key, value] of Object.entries(payload)) {
    // Prevent writing known transient flags as top-level DB columns
    if (!key.includes('.') && (key === 'skipDeliveryStep' || key === '__table')) {
      // skip this transient key — it is only used to control workflow logic or compat
      continue;
    }

    // Map new fields to workflow to avoid schema errors without DDL
    if (key === 'baseOrderId' || key === 'groupOrderIds' || key === 'invoiceId') {
      if (!next.workflow) next.workflow = {};
      next.workflow[key] = applyMarker(next.workflow[key], value);
      continue;
    }

    const existingValue = getPathValue(next, key);
    setDeep(next, key, applyMarker(existingValue, value));
  }
  return next;
}

function applyClientFilters(rows: any[], constraints: FirestoreConstraint[] = []): any[] {
  return constraints.reduce((filtered, constraint) => {
    if (constraint.type !== 'where') return filtered;

    return filtered.filter((row) => {
      const actual = getPathValue(row, constraint.field);
      const expected = constraint.value;

      switch (constraint.op) {
        case '==':
          return actual === expected;
        case 'in':
          return Array.isArray(expected) ? expected.includes(actual) : false;
        case 'not-in':
          return Array.isArray(expected) ? !expected.includes(actual) : true;
        case '>=':
          return actual >= expected;
        case '<=':
          return actual <= expected;
        case '>':
          return actual > expected;
        case '<':
          return actual < expected;
        case 'array-contains':
          // actual is the stored array; expected is the single value to look for
          return Array.isArray(actual) ? actual.includes(expected) : false;
        case 'array-contains-any':
          // actual is the stored array; expected is an array of values, any of which can match
          return Array.isArray(actual) && Array.isArray(expected)
            ? expected.some((v) => actual.includes(v))
            : false;
        default:
          return true;
      }
    });
  }, rows);
}

function applyOrderAndLimit(rows: any[], constraints: FirestoreConstraint[] = []): any[] {
  const order = constraints.find((item) => item.type === 'orderBy') as Extract<FirestoreConstraint, { type: 'orderBy' }> | undefined;
  const sizeConstraint = constraints.find((item) => item.type === 'limit') as Extract<FirestoreConstraint, { type: 'limit' }> | undefined;

  let result = [...rows];

  if (order) {
    result.sort((left, right) => {
      const leftValue = getPathValue(left, order.field);
      const rightValue = getPathValue(right, order.field);
      if (leftValue === rightValue) return 0;
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      const comparison = leftValue > rightValue ? 1 : -1;
      return order.direction === 'desc' ? -comparison : comparison;
    });
  }

  if (sizeConstraint) {
    result = result.slice(0, sizeConstraint.count);
  }

  return result;
}

function createCompatSnapshot(rows: any[]): SnapshotQuery {
  const docs = rows.map((row) => {
    const dataObj = { ...row };
    delete dataObj.__table;
    return {
      id: row.id,
      ref: buildDocHandle({ kind: 'doc', table: row.__table || 'unknown', id: row.id, path: `${row.__table || 'unknown'}/${row.id}` } as FirestoreRef),
      exists: () => true,
      data: () => dataObj,
    };
  });

  return {
    docs,
    size: rows.length,
    empty: rows.length === 0,
    forEach: (callback) => {
      docs.forEach(callback);
    },
  };
}

async function fetchRows(client: SupabaseClient, ref: FirestoreRef): Promise<any[]> {
  const constraints = ref.kind === 'query' ? ref.constraints || [] : [];
  let builder = client.from(ref.table).select('*');

  if (ref.orderId) {
    builder = builder.eq('order_id', ref.orderId);
  }

  for (const constraint of constraints) {
    if (constraint.type !== 'where' || constraint.field.includes('.')) continue;

    let fieldName = constraint.field;
    if (ref.table === 'orders' && fieldName === 'baseOrderId') {
      fieldName = 'workflow->>baseOrderId';
    } else if (ref.table === 'orders' && fieldName === 'groupOrderIds') {
      // JSONB arrays can't be filtered with simple equality in PostgREST without specific operators, 
      // so skip this and rely on client-side filtering for groupOrderIds.
      continue;
    }

    switch (constraint.op) {
      case '==':
        builder = builder.eq(fieldName, constraint.value);
        break;
      case 'in':
        builder = builder.in(fieldName, constraint.value);
        break;
      case 'not-in':
        builder = builder.not(fieldName, 'in', `(${constraint.value.map((item: any) => JSON.stringify(item)).join(',')})`);
        break;
      case '>=':
        builder = builder.gte(fieldName, typeof constraint.value === 'string' && fieldName.includes('At') ? JSON.stringify(constraint.value) : constraint.value);
        break;
      case '<=':
        builder = builder.lte(fieldName, typeof constraint.value === 'string' && fieldName.includes('At') ? JSON.stringify(constraint.value) : constraint.value);
        break;
      case '>':
        builder = builder.gt(fieldName, typeof constraint.value === 'string' && fieldName.includes('At') ? JSON.stringify(constraint.value) : constraint.value);
        break;
      case '<':
        builder = builder.lt(fieldName, typeof constraint.value === 'string' && fieldName.includes('At') ? JSON.stringify(constraint.value) : constraint.value);
        break;
      default:
        break;
    }
  }

  const { data, error } = await builder;
  if (error) throw error;

  const rows = Array.isArray(data) ? data.map((row) => {
    const mapped = { ...row, __table: ref.table };
    // Extract workflow fields to top-level if present
    if (row.workflow) {
      if (row.workflow.baseOrderId !== undefined) mapped.baseOrderId = row.workflow.baseOrderId;
      if (row.workflow.groupOrderIds !== undefined) mapped.groupOrderIds = row.workflow.groupOrderIds;
      if (row.workflow.invoiceId !== undefined) mapped.invoiceId = row.workflow.invoiceId;
    }
    // Extract order_items transient fields from itemWorkspace back to top-level
    if (ref.table === 'order_items' && row.itemWorkspace) {
      let workspace = row.itemWorkspace;
      if (typeof workspace === 'string') {
        try {
          workspace = JSON.parse(workspace);
        } catch {
          workspace = {};
        }
      }
      if (workspace) {
        const transientKeys = ['designUrl', 'designStatus', 'designUploadStats', 'designType', 'fileUrl'];
        transientKeys.forEach(k => {
          if (workspace[k] !== undefined) {
            mapped[k] = workspace[k];
          }
        });
      }
    }
    return mapped;
  }) : [];
  const filtered = applyClientFilters(rows, constraints);
  return applyOrderAndLimit(filtered, constraints);
}

async function getDocs(ref: FirestoreRef): Promise<SnapshotQuery> {
  const rows = await fetchRows(globalSupabaseClient, ref);
  return createCompatSnapshot(rows);
}

async function getDoc(ref: FirestoreRef): Promise<any> {
  const rows = await fetchRows(globalSupabaseClient, {
    ...ref,
    kind: 'query',
    constraints: [{ type: 'where', field: 'id', op: '==', value: ref.id }],
  });
  const row = rows[0];
  return {
    id: ref.id || row?.id,
    ref: buildDocHandle(ref),
    exists: () => Boolean(row),
    data: () => {
      if (!row) return undefined;
      const dataObj = { ...row };
      delete dataObj.__table;
      return dataObj;
    },
  };
}

async function setDoc(ref: FirestoreRef, data: any) {
  const id = ref.id || createId();
  const { data: existing, error: fetchError } = await globalSupabaseClient.from(ref.table).select('*').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;
  const payload = { ...data, id };
  if (ref.orderId) {
    payload.order_id = ref.orderId;
  }
  if (ref.itemId) {
    payload.item_id = ref.itemId;
  }
  const next = normalizePayload(payload, existing || {}, ref.table);
  if (ref.table === 'payments') {
    delete next.metadata;
    delete next.itemBreakdown;
    delete next.baseOrderId;
  }
  const { error } = await globalSupabaseClient.from(ref.table).upsert(next, { onConflict: 'id' });
  if (error) throw error;
}

async function addDoc(ref: FirestoreRef, data: any) {
  const id = createId();
  await setDoc({ ...ref, id }, data);
  return { id };
}

async function updateDoc(ref: FirestoreRef, updates: Record<string, any>) {
  if (!ref.id) throw new Error('updateDoc requires an id');
  let { data: existing, error: fetchError } = await globalSupabaseClient.from(ref.table).select('*').eq('id', ref.id).maybeSingle();
  if (fetchError) throw fetchError;
  
  if (!existing) {
    if (ref.table === 'order_items' && ref.orderId) {
      // Auto-create the order_items row from the parent order's items array
      const { data: orderDoc, error: orderError } = await globalSupabaseClient
        .from('orders')
        .select('items')
        .eq('id', ref.orderId)
        .maybeSingle();
      
      let matchedItem: any = null;
      if (!orderError && orderDoc) {
        const orderItems = Array.isArray(orderDoc.items) 
          ? orderDoc.items 
          : Object.values(orderDoc.items || {});
        matchedItem = orderItems.find((i: any) => i && (i.id === ref.id || i.itemId === ref.id));
      }

      // Build baseline using ONLY columns that exist in the order_items table:
      // id, order_id, status, productName, description, designType, itemWorkspace,
      // tiff_path, tiff_assigned_at, tiff_assigned_by, assignedPrinterId, assignedPrinterName
      const baseline: Record<string, any> = {
        id: ref.id,
        order_id: ref.orderId,
        status: matchedItem?.status || 'PENDING',
      };
      if (matchedItem?.productName) baseline['productName'] = matchedItem.productName;
      if (matchedItem?.description) baseline['description'] = matchedItem.description;
      if (matchedItem?.designType) baseline['designType'] = matchedItem.designType;
      if (matchedItem?.itemWorkspace) baseline['itemWorkspace'] = matchedItem.itemWorkspace;

      // Upsert: insert or update in case it already exists with different id format
      const { error: upsertError } = await globalSupabaseClient
        .from('order_items')
        .upsert(baseline, { onConflict: 'id', ignoreDuplicates: false });
      
      if (!upsertError) {
        const { data: newExisting } = await globalSupabaseClient
          .from('order_items')
          .select('*')
          .eq('id', ref.id)
          .maybeSingle();
        if (newExisting) {
          existing = newExisting;
        }
      } else {
        console.error('[updateDoc] Failed to auto-create order_items row:', upsertError);
      }
    }
  }

  if (!existing) throw new Error(`Document ${ref.id} not found in ${ref.table}`);
  
  const payload = { ...updates };
  if (ref.orderId) {
    payload.order_id = ref.orderId;
  }
  if (ref.itemId) {
    payload.item_id = ref.itemId;
  }
  
  let expectedVersion: number | undefined;
  if (ref.table === 'orders') {
    if (payload.expectedVersion !== undefined) {
      expectedVersion = payload.expectedVersion;
      delete payload.expectedVersion;
    }
  }

  const next = normalizePayload(payload, existing, ref.table);
  if (ref.table === 'payments') {
    delete next.metadata;
    delete next.itemBreakdown;
    delete next.baseOrderId;
  }

  let query = globalSupabaseClient.from(ref.table).update(next).eq('id', ref.id);

  if (ref.table === 'orders' && expectedVersion !== undefined) {
    next.version = expectedVersion + 1;
    // Re-create the query because we mutated 'next'
    query = globalSupabaseClient.from(ref.table).update(next).eq('id', ref.id).eq('version', expectedVersion).select('id');
  } else {
    query = query.select('id');
  }

  const { data, error } = await query;
  if (error) throw error;

  if (ref.table === 'orders' && expectedVersion !== undefined) {
    if (!data || data.length === 0) {
      throw new Error('This order has been modified by another user.');
    }
  }
}

async function deleteDoc(ref: FirestoreRef) {
  if (!ref.id) throw new Error('deleteDoc requires an id');
  const { error } = await globalSupabaseClient.from(ref.table).delete().eq('id', ref.id);
  if (error) throw error;
}

async function getCountFromServer(ref: FirestoreRef) {
  const rows = await fetchRows(globalSupabaseClient, ref);
  return {
    data: () => ({ count: rows.length }),
  };
}

function onSnapshot(ref: FirestoreRef, next: (snapshot: any) => void, error?: (err: any) => void) {
  let active = true;
  const channelName = `firestore:${ref.table}:${ref.path}:${createId()}`;

  const channel = globalSupabaseClient
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: ref.table }, async () => {
      if (!active) return;
      try {
        const snapshot = ref.kind === 'doc'
          ? await getDoc(ref)
          : await getDocs(ref.kind === 'query' ? ref : { ...ref, kind: 'query', constraints: ref.constraints || [] });
        next(snapshot);
      } catch (err) {
        if (error) error(err);
      }
    });

  void channel.subscribe();

  void (async () => {
    if (!active) return;
    try {
      const snapshot = ref.kind === 'doc'
        ? await getDoc(ref)
        : await getDocs(ref.kind === 'query' ? ref : { ...ref, kind: 'query', constraints: ref.constraints || [] });
      next(snapshot);
    } catch (err) {
      if (error) error(err);
    }
  })();

  return () => {
    active = false;
    void globalSupabaseClient.removeChannel(channel);
  };
}

function buildDocHandle(ref: FirestoreRef) {
  return {
    __ref: ref,
    id: ref.id,
    path: ref.path,
    async get() {
      return getDoc(ref);
    },
    async set(data: any) {
      return setDoc(ref, data);
    },
    async update(data: Record<string, any>) {
      return updateDoc(ref, data);
    },
    async delete() {
      return deleteDoc(ref);
    },
    collection(subcollectionName: string) {
      return createCollectionHandle(makeCollectionRef(`${ref.path}/${subcollectionName}`));
    },
  };
}

function createCollectionHandle(ref: FirestoreRef) {
  return {
    __ref: ref,
    path: ref.path,
    async get() {
      return getDocs(ref);
    },
    async add(data: any) {
      return addDoc(ref, data);
    },
    doc(id?: string) {
      const generatedId = id || createId();
      return buildDocHandle(doc(globalSupabaseClient as any, `${ref.path}/${generatedId}`));
    },
    where(field: string, op: any, value: any) {
      return createQueryHandle(query(ref as any, where(field, op, value)));
    },
    orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
      return createQueryHandle(query(ref as any, orderBy(field, direction)));
    },
    limit(count: number) {
      return createQueryHandle(query(ref as any, limit(count)));
    },
    collection(subcollectionName: string) {
      return createCollectionHandle(makeCollectionRef(`${ref.path}/${subcollectionName}`));
    },
  };
}

function createQueryHandle(ref: FirestoreRef) {
  return {
    __ref: ref,
    path: ref.path,
    async get() {
      return getDocs(ref);
    },
    where(field: string, op: any, value: any) {
      return createQueryHandle(query(ref as any, where(field, op, value)));
    },
    orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
      return createQueryHandle(query(ref as any, orderBy(field, direction)));
    },
    limit(count: number) {
      return createQueryHandle(query(ref as any, limit(count)));
    },
    collection(subcollectionName: string) {
      return createCollectionHandle(makeCollectionRef(`${ref.path}/${subcollectionName}`));
    },
  };
}

function createSupabaseFirestoreCompat(client: SupabaseClient) {
  globalSupabaseClient = client;

  return {
    collection,
    doc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    getDoc,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    getCountFromServer,
    onSnapshot,
    serverTimestamp,
    arrayUnion,
    increment,
    createCollectionHandle,
    createQueryHandle,
    buildDocHandle,
  };
}

export type Unsubscribe = () => void;

export {
  createSupabaseFirestoreCompat,
  createCollectionHandle,
  createQueryHandle,
  buildDocHandle,
  serverTimestamp,
  arrayUnion,
  increment,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getCountFromServer,
  onSnapshot,
};
