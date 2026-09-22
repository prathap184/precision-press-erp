import { Order } from '@/types/models';
import { UserRole } from '@/types/auth';

/**
 * Finds the current workflow step for a given order
 */
export function getCurrentWorkflowStep(order: Order | null) {
  if (!order?.workflowSnapshot?.steps) return null;
  const idx = order.workflowSnapshot.currentStepIndex ?? 0;
  return order.workflowSnapshot.steps[idx] || null;
}

/**
 * Finds the workflow step that matches a specific role
 */
export function getStepForRole(order: Order | null, role: UserRole) {
  if (!order?.workflowSnapshot?.steps) return null;
  return order.workflowSnapshot.steps.find(step => step.role === role) || null;
}

export function getRoleSteps(order: Order | null, role: UserRole) {
  if (!order?.workflowSnapshot?.steps) return [];
  return order.workflowSnapshot.steps.filter(step => step.role === role);
}

export function hasRoleStepInProgressOrCompleted(order: Order | null, role: UserRole) {
  const roleSteps = getRoleSteps(order, role);
  return roleSteps.some(step => ['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(step.status));
}

/**
 * Normalizes string for fuzzy / robust matching across spaces, underscores, cases
 */
export function normalizeCategoryString(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ''); // removes spaces, underscores, hyphens
}

/**
 * Centralized verification: does an order belong to this printer user's machine stream?
 */
export function matchesPrinterStream(
  order: Order | null,
  printerCategory?: string | string[],
  printerSubCategory?: string | string[]
): boolean {
  if (!order) return false;

  // Convert categories to array
  const rawCategories: string[] = Array.isArray(printerCategory)
    ? printerCategory
    : (printerCategory ? printerCategory.split(',').map(s => s.trim()).filter(Boolean) : []);

  // If no category specified or user has MAIN_PRINTER, supervisor sees everything
  if (rawCategories.length === 0 || rawCategories.includes('MAIN_PRINTER')) return true;

  // Convert subcategories to array
  const rawSubCategories: string[] = Array.isArray(printerSubCategory)
    ? printerSubCategory
    : (printerSubCategory ? printerSubCategory.split(',').map(s => s.trim()).filter(Boolean) : []);

  // Extract order category
  let orderCat = order.printerCategory || (order as any).printing_category_name || '';
  if (!orderCat && order.items?.length) {
    const firstItem = order.items[0] as any;
    orderCat = firstItem.printerCategory || firstItem.printing_category_name || firstItem.printingCategoryName || firstItem.category || '';
    if (!orderCat) {
      const firstItemName = (firstItem.productName || firstItem.name || '').toLowerCase();
      if (firstItemName.includes('eco')) orderCat = 'ECO_SOLVENT';
      else if (firstItemName.includes('uv')) orderCat = 'UV_PRINT';
      else if (firstItemName.includes('sol') || firstItemName.includes('solvent')) orderCat = 'SOLVENT_PRINT';
      else if (firstItemName.includes('latex')) orderCat = 'LATEX_PRINT';
      else if (firstItemName.includes('id card') || firstItemName.includes('visitor pass') || firstItemName.includes('membership') || firstItemName.includes('loyalty') || firstItemName.includes('access card') || firstItemName.includes('proximity') || firstItemName.includes('lanyard') || firstItemName.includes('holder') || firstItemName.includes('yo-yo')) orderCat = 'ID_CARDS';
      else if (firstItemName.includes('dig') || firstItemName.includes('digital') || firstItemName.includes('vinyl') || firstItemName.includes('art paper') || firstItemName.includes('art card') || firstItemName.includes('sticker paper') || firstItemName.includes('envelope') || firstItemName.includes('invitation card') || firstItemName.includes('menu card') || firstItemName.includes('calendar sheet')) orderCat = 'DIGITAL_PRINT';
      else if (firstItemName.includes('flex')) orderCat = 'FLEX_PRINT';
    }
  }

  const orderCatNorm = normalizeCategoryString(orderCat);

  // Helper to match an order category to a target category
  const matchCategory = (target: string): boolean => {
    const targetNorm = normalizeCategoryString(target);
    if (!targetNorm) return false;
    if (orderCatNorm === targetNorm) return true;
    const simplifiedTarget = targetNorm.replace('print', '');
    const simplifiedOrder = orderCatNorm.replace('print', '');
    return simplifiedTarget.length > 0 && simplifiedTarget === simplifiedOrder;
  };

  // Check if order category matches ANY of the user's assigned categories
  const matchedTargetCategory = rawCategories.find(matchCategory);
  if (!matchedTargetCategory) {
    return false;
  }

  // If no subcategories assigned to printer, printer handles ALL subcategories
  if (rawSubCategories.length === 0) {
    return true;
  }

  // Extract order subcategories
  const orderSubCat = (order as any).printerSubCategory || (order as any).printing_subcategory_name || '';
  const orderSubNorm = normalizeCategoryString(orderSubCat);

  const matchSubcategory = (targetSub: string): boolean => {
    const targetSubNorm = normalizeCategoryString(targetSub);
    if (!targetSubNorm) return false;
    if (orderSubNorm && orderSubNorm === targetSubNorm) return true;

    if (order.items?.length) {
      return order.items.some((item: any) => {
        const itemSub = item.printerSubCategory || item.printing_subcategory_name || item.printingSubcategoryName || '';
        if (itemSub && normalizeCategoryString(itemSub) === targetSubNorm) return true;

        // Smart fallback: check product name / code for subcategory hints
        const pName = (item.productName || item.name || '').toLowerCase();
        const pCode = (item.productId || item.code || item.sku || '').toLowerCase();
        if (targetSubNorm.includes('mutoh') && (pName.includes('( mu )') || pName.includes('(mu)') || pName.includes('mutoh') || pCode.startsWith('mut-'))) {
          return true;
        }
        if (targetSubNorm.includes('blackgrey') && (pName.includes('black back') || pName.includes('grey back') || pName.includes('gray back'))) {
          return true;
        }
        return false;
      });
    }

    return false;
  };

  // Check if order matches ANY of the user's assigned subcategories
  return rawSubCategories.some(matchSubcategory);
}

/**
 * Checks if an order is in the "Unassigned Backlog" for a given role
 * (order is at this role's step and status is PENDING)
 */
export function isUnassignedForRole(
  order: Order | null, 
  role: UserRole, 
  printerCategory?: string,
  printerSubCategory?: string
): boolean {
  if (!order) return false;

  // For PRINTER, ensure the order matches the specific printer stream (unless MAIN_PRINTER)
  if (role === 'PRINTER') {
    if (!matchesPrinterStream(order, printerCategory, printerSubCategory)) {
      return false;
    }
  }

  if (role === 'ACCOUNTANT') {
    const accountantStep = getStepForRole(order, 'ACCOUNTANT');
    return accountantStep?.status === 'PENDING' && !accountantStep.completedBy;
  }

  const currentStep = getCurrentWorkflowStep(order);
  if (!currentStep) return false;

  if (currentStep.role !== role || currentStep.status !== 'PENDING') return false;

  if (role === 'DESIGNER') {
    return !order.workflow?.assignedTo && !order.workflow?.designedBy;
  }

  return !order.workflow?.assignedTo;
}

/**
 * Checks if an order is an "Active Job" for a given role
 * (order is at this role's step and status is IN_PROGRESS, COMPLETED, or assigned)
 */
export function isActiveJobForRole(
  order: Order | null, 
  role: UserRole, 
  printerCategory?: string,
  printerSubCategory?: string
): boolean {
  if (!order) return false;

  // For PRINTER, ensure the order matches the specific printer stream (unless MAIN_PRINTER)
  if (role === 'PRINTER') {
    if (!matchesPrinterStream(order, printerCategory, printerSubCategory)) {
      return false;
    }
  }

  if (role === 'ACCOUNTANT') {
    const accountantStep = getStepForRole(order, 'ACCOUNTANT');
    return accountantStep?.status === 'COMPLETED';
  }

  if (role === 'PRINTER') {
    const printerStep = getStepForRole(order, 'PRINTER');
    return printerStep?.role === 'PRINTER' && ['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(printerStep.status);
  }

  if (role === 'DESIGNER') {
    return hasRoleStepInProgressOrCompleted(order, 'DESIGNER');
  }

  const currentStep = getCurrentWorkflowStep(order);
  if (!currentStep || currentStep.role !== role) return false;

  if (currentStep.status === 'IN_PROGRESS' || currentStep.status === 'COMPLETED') {
    return true;
  }

  if (currentStep.status === 'PENDING') {
    if (['PASTING', 'FINISHING', 'DISPATCH', 'DELIVERY', 'DELIVERY_PARTNER'].includes(role)) {
      return true;
    }
    return Boolean(order.workflow?.assignedTo || order.workflow?.designedBy);
  }

  return false;
}

/**
 * Filters orders to show unassigned backlog for a role
 */
export function filterUnassignedBacklog(
  orders: Order[], 
  role: UserRole, 
  printerCategory?: string,
  printerSubCategory?: string
): Order[] {
  return orders.filter(order => isUnassignedForRole(order, role, printerCategory, printerSubCategory));
}

/**
 * Filters orders to show active jobs for a role
 */
export function filterActiveJobs(
  orders: Order[], 
  role: UserRole, 
  userId?: string, 
  scope: 'mine' | 'all' = 'mine', 
  printerCategory?: string,
  printerSubCategory?: string
): Order[] {
  if (role === 'ACCOUNTANT') {
    return orders.filter(order => {
      const accountantStep = getStepForRole(order, 'ACCOUNTANT');
      if (scope === 'all' || !userId) {
        return accountantStep?.status === 'COMPLETED';
      }
      return accountantStep?.status === 'COMPLETED' && accountantStep.completedBy === userId;
    });
  }

  if (scope === 'all' || !userId) {
    return orders.filter(order => isActiveJobForRole(order, role, printerCategory, printerSubCategory));
  }

  return orders.filter(order => {
    if (!isActiveJobForRole(order, role, printerCategory, printerSubCategory)) return false;

    if (role === 'DESIGNER') {
      const designerStep = getStepForRole(order, 'DESIGNER');
      const workedByCurrentDesigner = Boolean(
        designerStep &&
        ['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(designerStep.status) &&
        (designerStep.completedBy === userId || order.workflow?.designedBy === userId || order.workflow?.assignedTo === userId)
      );

      return workedByCurrentDesigner;
    }

    return order.workflow?.assignedTo === userId || order.workflow?.designedBy === userId;
  });
}

/**
 * Gets all orders relevant to a role's current workflow step
 */
export function getOrdersForRoleWorkflow(
  orders: Order[], 
  role: UserRole, 
  printerCategory?: string,
  printerSubCategory?: string
): {
  unassigned: Order[];
  active: Order[];
} {
  return {
    unassigned: filterUnassignedBacklog(orders, role, printerCategory, printerSubCategory),
    active: filterActiveJobs(orders, role, undefined, 'mine', printerCategory, printerSubCategory),
  };
}
