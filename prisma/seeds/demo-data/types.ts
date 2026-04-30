export type GoalType = 'item' | 'finance' | 'action' | 'group';
export type GoalStatus = 'active' | 'completed' | 'archived';
export type GroupLayout = 'grid' | 'list' | 'kanban';
export type ProgressType = 'average' | 'sum' | 'manual';
export type ItemStatusBadge =
  | 'in-stock'
  | 'in_stock'
  | 'price-drop'
  | 'price_drop'
  | 'pending-search'
  | 'pending_search'
  | 'candidates_found'
  | 'not_found'
  | 'not_supported';

export interface Goal {
  id: string;
  type: GoalType;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  status: GoalStatus;
  targetDate?: Date;
  parentGoalId?: string;
  subgoals?: Goal[];
}

export interface ProductSearchResult {
  id: string;
  name: string;
  price: number;
  retailer: string;
  url: string;
  image: string;
}

export interface ProductCandidate extends ProductSearchResult {
  condition?: 'new' | 'used' | 'refurbished';
  rating?: number;
  reviewCount?: number;
  priceHistory?: number[];
  savings?: number;
  inStock?: boolean;
  estimatedDelivery?: string;
  features?: string[];
}

export interface ItemGoal extends Goal {
  type: 'item';
  productImage: string;
  bestPrice: number;
  currency: string;
  retailerUrl: string;
  retailerName: string;
  statusBadge: ItemStatusBadge;
  searchResults?: ProductSearchResult[];
  candidates?: ProductCandidate[];
  selectedCandidateId?: string;
  shortlistedCandidates?: ProductCandidate[];
  deniedCandidates?: ProductCandidate[];
  stackId?: string;
  stackOrder?: number;
  searchTerm?: string;
  retailerFilters?: Record<string, unknown>;
}

export interface FinanceGoal extends Goal {
  type: 'finance';
  institutionIcon: string;
  accountName: string;
  currentBalance: number;
  targetBalance: number;
  currency: string;
  progressHistory: number[];
  lastSync: Date;
}

export interface ActionTask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
}

export interface ActionGoal extends Goal {
  type: 'action';
  completionPercentage: number;
  tasks: ActionTask[];
  motivation?: string;
}

export interface GroupGoal extends Goal {
  type: 'group';
  icon?: string;
  color?: string;
  layout: GroupLayout;
  progressType: ProgressType;
  progress: number;
  subgoals: Goal[];
}
