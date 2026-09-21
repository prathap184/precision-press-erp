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
  printerCategory?: string,
  printerSubCategory?: string
): boolean {
  if (!order) return false;
  // If no category specified or user is MAIN_PRINTER, supervisor sees everything
  if (!printerCategory || printerCategory === 'MAIN_PRINTER') return true;

  const targetCatNorm = normalizeCategoryString(printerCategory);
  
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

  // If order category does not match user category, reject immediately
  if (orderCatNorm !== targetCatNorm) {
    // Also check standard aliases (e.g. "SOLVENT" vs "SOLVENT_PRINT", "ECOSOLVENT" vs "ECO_SOLVENT")
    const simplifiedTarget = targetCatNorm.replace('print', '');
    const simplifiedOrder = orderCatNorm.replace('print', '');
    if (!simplifiedTarget || simplifiedTarget !== simplifiedOrder) {
      return false;
    }
  }

  // Category matched! Now check subcategory if assigned to this printer
  const targetSubNorm = normalizeCategoryString(printerSubCategory);
  if (!targetSubNorm) {
    // Printer handles all subcategories of this category
    return true;
  }

  // Extract order subcategory
  let orderSubCat = (order as any).printerSubCategory || (order as any).printing_subcategory_name || '';
  if (!orderSubCat && order.items?.length) {
    const firstItem = order.items[0] as any;
    orderSubCat = firstItem.printerSubCategory || firstItem.printing_subcategory_name || firstItem.printingSubcategoryName || '';
  }

  const orderSubNorm = normalizeCategoryString(orderSubCat);
  return orderSubNorm === targetSubNorm;
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
