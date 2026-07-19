// @ts-nocheck
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
 * Checks if an order is in the "Unassigned Backlog" for a given role
 * (order is at this role's step and status is PENDING)
 */
export function isUnassignedForRole(order: Order | null, role: UserRole, printerCategory?: string): boolean {
  if (!order) return false;

  const normalizeCat = (cat?: string | null) => {
    let c = (cat || '').toUpperCase().replace(/[^A-Z_]/g, '').replace('ECOSOLVENT', 'ECO_SOLVENT');
    if (c === 'IDCARDS' || c === 'ID_CARDS') return 'ID_CARDS';
    if (c === 'DIGITAL' || c === 'DIGITAL_PRINT') return 'DIGITAL_PRINT';
    return c;
  };

  // For PRINTER, ensure the order matches the specific printer category (unless MAIN_PRINTER)
  if (role === 'PRINTER' && printerCategory && printerCategory !== 'MAIN_PRINTER') {
    let orderCat = normalizeCat(order.printerCategory);
    const firstItem = order.items?.[0] as any;
    const firstItemName = firstItem?.productName || firstItem?.name;
    if (!orderCat && firstItemName) {
       const itemName = firstItemName.toLowerCase();
       if (itemName.includes('eco')) orderCat = 'ECO_SOLVENT';
       else if (itemName.includes('uv')) orderCat = 'UV_PRINT';
       else if (itemName.includes('sol') || itemName.includes('solvent')) orderCat = 'SOLVENT_PRINT';
       else if (itemName.includes('latex')) orderCat = 'LATEX_PRINT';
       else if (itemName.includes('id card') || itemName.includes('visitor pass') || itemName.includes('membership') || itemName.includes('loyalty') || itemName.includes('access card') || itemName.includes('proximity') || itemName.includes('lanyard') || itemName.includes('holder') || itemName.includes('yo-yo')) orderCat = 'ID_CARDS';
        else if (itemName.includes('dig') || itemName.includes('digital') || itemName.includes('vinyl') || itemName.includes('art paper') || itemName.includes('art card') || itemName.includes('sticker paper') || itemName.includes('envelope') || itemName.includes('invitation card') || itemName.includes('menu card') || itemName.includes('calendar sheet')) orderCat = 'DIGITAL_PRINT';
        else if (itemName.includes('flex')) orderCat = 'FLEX_PRINT';
    }
    const userCat = normalizeCat(printerCategory);
    if (orderCat !== userCat) {
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
export function isActiveJobForRole(order: Order | null, role: UserRole, printerCategory?: string): boolean {
  if (!order) return false;

  const normalizeCat = (cat?: string | null) => {
    let c = (cat || '').toUpperCase().replace(/[^A-Z_]/g, '').replace('ECOSOLVENT', 'ECO_SOLVENT');
    if (c === 'IDCARDS' || c === 'ID_CARDS') return 'ID_CARDS';
    if (c === 'DIGITAL' || c === 'DIGITAL_PRINT') return 'DIGITAL_PRINT';
    return c;
  };

  // For PRINTER, ensure the order matches the specific printer category (unless MAIN_PRINTER)
  if (role === 'PRINTER' && printerCategory && printerCategory !== 'MAIN_PRINTER') {
    let orderCat = normalizeCat(order.printerCategory);
    if (!orderCat) {
      order.items?.some(item => {
        const i = item as any;
        const itemName = (i.productName || i.name || '').toLowerCase();
        if (itemName.includes('eco')) orderCat = 'ECO_SOLVENT';
        else if (itemName.includes('uv')) orderCat = 'UV_PRINT';
        else if (itemName.includes('sol') || itemName.includes('solvent')) orderCat = 'SOLVENT_PRINT';
        else if (itemName.includes('latex')) orderCat = 'LATEX_PRINT';
        else if (itemName.includes('id card') || itemName.includes('visitor pass') || itemName.includes('membership') || itemName.includes('loyalty') || itemName.includes('access card') || itemName.includes('proximity') || itemName.includes('lanyard') || itemName.includes('holder') || itemName.includes('yo-yo')) orderCat = 'ID_CARDS';
        else if (itemName.includes('dig') || itemName.includes('digital') || itemName.includes('vinyl') || itemName.includes('art paper') || itemName.includes('art card') || itemName.includes('sticker paper') || itemName.includes('envelope') || itemName.includes('invitation card') || itemName.includes('menu card') || itemName.includes('calendar sheet')) orderCat = 'DIGITAL_PRINT';
        else if (itemName.includes('flex')) orderCat = 'FLEX_PRINT';
        return !!orderCat;
      });
    }
    const userCat = normalizeCat(printerCategory);
    if (orderCat !== userCat) {
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
export function filterUnassignedBacklog(orders: Order[], role: UserRole, printerCategory?: string): Order[] {
  return orders.filter(order => isUnassignedForRole(order, role, printerCategory));
}

/**
 * Filters orders to show active jobs for a role
 */
export function filterActiveJobs(orders: Order[], role: UserRole, userId?: string, scope: 'mine' | 'all' = 'mine', printerCategory?: string): Order[] {
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
    return orders.filter(order => isActiveJobForRole(order, role, printerCategory));
  }

  return orders.filter(order => {
    if (!isActiveJobForRole(order, role, printerCategory)) return false;

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
export function getOrdersForRoleWorkflow(orders: Order[], role: UserRole, printerCategory?: string): {
  unassigned: Order[];
  active: Order[];
} {
  return {
    unassigned: filterUnassignedBacklog(orders, role, printerCategory),
    active: filterActiveJobs(orders, role, undefined, 'mine', printerCategory),
  };
}

