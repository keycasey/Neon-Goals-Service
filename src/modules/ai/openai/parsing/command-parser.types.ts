/**
 * Types for the Command Parser Service
 * Used for parsing and handling AI-generated commands in goal management
 */

/**
 * Supported command types that can be parsed from AI responses
 */
export type CommandType =
  | 'CREATE_GOAL'
  | 'CREATE_SUBGOAL'
  | 'UPDATE_PROGRESS'
  | 'UPDATE_TITLE'
  | 'UPDATE_TARGET_BALANCE'
  | 'UPDATE_TARGET_DATE'
  | 'UPDATE_SEARCHTERM'
  | 'UPDATE_FILTERS'
  | 'REFRESH_CANDIDATES'
  | 'ADD_TASK'
  | 'REMOVE_TASK'
  | 'TOGGLE_TASK'
  | 'ARCHIVE_GOAL';

/**
 * Proposal types for UI action buttons
 * - confirm_edit_cancel: Standard three-button confirmation flow
 * - accept_decline: Simple two-button accept/decline flow
 */
export type ProposalType = 'confirm_edit_cancel' | 'accept_decline';

/**
 * Represents a parsed command from AI response content
 */
export interface ParsedCommand {
  /** The type of command */
  type: CommandType;
  /** The command payload data */
  data: Record<string, any>;
}

/**
 * Task data structure used in action goals
 */
export interface TaskData {
  /** Task title/description */
  title: string;
  /** Optional task ID for updates */
  id?: string;
}

/**
 * Search filters for item goals (non-vehicle categories)
 */
export interface SearchFilters {
  /** Category of the search */
  category?: string;
  /** Brand preferences */
  brands?: string[];
  /** Color preferences */
  colors?: string[];
  /** Size preference */
  size?: string;
  /** Minimum RAM (technology) */
  minRam?: string;
  /** Minimum storage (technology) */
  minStorage?: string;
  /** Screen size (technology) */
  screenSize?: string;
  /** Processor type (technology) */
  processor?: string;
  /** GPU type (technology) */
  gpu?: string;
  /** Material preference (furniture) */
  material?: string;
  /** Style preference (furniture) */
  style?: string;
  /** Dimensions (furniture) */
  dimensions?: string;
  /** Sport type (sporting goods) */
  sport?: string;
  /** Condition preference */
  condition?: string;
  /** Breed preferences (pets) */
  breeds?: string[];
  /** Age preference (pets) */
  age?: string;
  /** Gender preference (clothing) */
  gender?: string;
  /** Any additional filter properties */
  [key: string]: any;
}

/**
 * Goal data extracted from CREATE_GOAL commands
 */
export interface GoalData {
  /** Goal type */
  type?: 'item' | 'finance' | 'action';
  /** Goal title */
  title?: string;
  /** Goal description */
  description?: string;
  /** Budget for item goals */
  budget?: number;
  /** Category for item goals */
  category?: string;
  /** Search term for item goals */
  searchTerm?: string;
  /** Structured search filters for item goals */
  searchFilters?: SearchFilters;
  /** Target balance for finance goals */
  targetBalance?: number;
  /** Current balance for finance goals */
  currentBalance?: number;
  /** Tasks for action goals */
  tasks?: TaskData[];
  /** Target date for the goal */
  targetDate?: string;
  /** Motivation for action goals */
  motivation?: string;
  /** Deadline (alternative to targetDate) */
  deadline?: string;
}

/**
 * Subgoal data extracted from CREATE_SUBGOAL commands
 */
export interface SubgoalData {
  /** Subgoal title */
  title: string;
  /** Subgoal description */
  description?: string;
  /** Parent goal ID or title reference */
  parentGoalId: string;
}

/**
 * Update filters command data
 */
export interface UpdateFiltersData {
  /** ZIP code for location-based search */
  zip?: string;
  /** Search radius in miles */
  distance?: number;
  /** Minimum year (vehicles) */
  yearMin?: number;
  /** Maximum year (vehicles) */
  yearMax?: number;
  /** Maximum price */
  maxPrice?: number;
  /** Maximum mileage (vehicles) */
  mileageMax?: number;
  /** Drivetrain preference */
  drivetrain?: string;
  /** Exterior color preference */
  exteriorColor?: string;
}

/**
 * Update progress command data
 */
export interface UpdateProgressData {
  /** Completion percentage (0-100) */
  completionPercentage: number;
}

/**
 * Update search term command data
 */
export interface UpdateSearchTermData {
  /** New search term */
  searchTerm: string;
}

/**
 * Task operation command data
 */
export interface TaskOperationData {
  /** Task ID for remove/toggle operations */
  taskId?: string;
  /** Task data for add operations */
  task?: TaskData;
}
