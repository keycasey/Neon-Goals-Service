import { Injectable, Logger } from '@nestjs/common';
import {
  CommandType,
  ParsedCommand,
  ProposalType,
  GoalData,
} from './command-parser.types';

/**
 * Service for parsing structured commands from AI response content.
 *
 * Handles parsing of various command types (CREATE_GOAL, CREATE_SUBGOAL, UPDATE_*, etc.)
 * that are embedded in AI-generated text responses.
 *
 * All methods are pure functions with no external dependencies.
 */
@Injectable()
export class CommandParserService {
  private readonly logger = new Logger(CommandParserService.name);

  /**
   * Parse structured commands from AI response content.
   *
   * Supports the following command types:
   * - CREATE_GOAL: Create a new goal (with nested object support)
   * - CREATE_SUBGOAL: Create a subgoal under a parent goal
   * - UPDATE_PROGRESS: Update goal completion percentage
   * - UPDATE_TITLE: Update goal title
   * - UPDATE_TARGET_BALANCE: Update finance goal target balance
   * - UPDATE_TARGET_DATE: Update goal target date
   * - UPDATE_SEARCHTERM: Update item goal search term
   * - UPDATE_FILTERS: Update item goal search filters
   * - REFRESH_CANDIDATES: Refresh item goal candidates
   * - ADD_TASK: Add a task to an action goal
   * - REMOVE_TASK: Remove a task from an action goal
   * - TOGGLE_TASK: Toggle task completion status
   * - ARCHIVE_GOAL: Archive a goal
   *
   * @param content - The AI response content to parse
   * @returns Array of parsed commands with type and data
   */
  parseCommands(content: string): ParsedCommand[] {
    const commands: ParsedCommand[] = [];

    // Parse CREATE_GOAL commands (must come before CREATE_SUBGOAL to avoid partial matches)
    // Parse CREATE_GOAL commands with proper brace counting for nested objects
    const goalKeywordIndices: number[] = [];
    let searchStart = 0;
    while (true) {
      const keywordIndex = content.indexOf('CREATE_GOAL:', searchStart);
      if (keywordIndex === -1) break;
      goalKeywordIndices.push(keywordIndex);
      searchStart = keywordIndex + 'CREATE_GOAL:'.length;
    }

    for (const keywordIndex of goalKeywordIndices) {
      const result = this.parseNestedJsonObject(content, keywordIndex);
      if (result) {
        try {
          const data = JSON.parse(result.jsonStr);
          commands.push({ type: 'CREATE_GOAL', data });
        } catch (e) {
          this.logger.warn('Failed to parse CREATE_GOAL command:', e);
          this.logger.warn(
            'JSON string was:',
            content.substring(keywordIndex, Math.min(result.endIndex + 100, content.length)),
          );
        }
      }
    }

    // Parse CREATE_SUBGOAL commands
    const subgoalMatches = content.matchAll(/CREATE_SUBGOAL:\s*({[^}]+})/g);
    for (const match of subgoalMatches) {
      try {
        const data = JSON.parse(match[1]);
        commands.push({ type: 'CREATE_SUBGOAL', data });
      } catch (e) {
        this.logger.warn('Failed to parse CREATE_SUBGOAL command:', e);
      }
    }

    // Parse UPDATE_PROGRESS commands
    const progressMatches = content.matchAll(/UPDATE_PROGRESS:\s*({[^}]+})/g);
    for (const match of progressMatches) {
      try {
        const data = JSON.parse(match[1]);
        commands.push({ type: 'UPDATE_PROGRESS', data });
      } catch (e) {
        this.logger.warn('Failed to parse UPDATE_PROGRESS command:', e);
      }
    }

    // Parse UPDATE_TITLE commands
    const titleMatches = content.matchAll(/UPDATE_TITLE:\s*({[^}]+})/g);
    for (const match of titleMatches) {
      try {
        const data = JSON.parse(match[1]);
        commands.push({ type: 'UPDATE_TITLE', data });
      } catch (e) {
        this.logger.warn('Failed to parse UPDATE_TITLE command:', e);
      }
    }

    // Parse UPDATE_TARGET_BALANCE commands
    const targetBalanceMatches = content.matchAll(/UPDATE_TARGET_BALANCE:\s*({[^}]+})/g);
    for (const match of targetBalanceMatches) {
      try {
        const data = JSON.parse(match[1]);
        commands.push({ type: 'UPDATE_TARGET_BALANCE', data });
      } catch (e) {
        this.logger.warn('Failed to parse UPDATE_TARGET_BALANCE command:', e);
      }
    }

    // Parse UPDATE_TARGET_DATE commands
    const targetDateMatches = content.matchAll(/UPDATE_TARGET_DATE:\s*({[^}]+})/g);
    for (const match of targetDateMatches) {
      try {
        const data = JSON.parse(match[1]);
        commands.push({ type: 'UPDATE_TARGET_DATE', data });
      } catch (e) {
        this.logger.warn('Failed to parse UPDATE_TARGET_DATE command:', e);
      }
    }

    // Parse UPDATE_SEARCHTERM commands (with nested object support)
    this.parseCommandWithNestedObject(content, 'UPDATE_SEARCHTERM:', commands);

    // Parse REFRESH_CANDIDATES commands (with nested object support)
    this.parseCommandWithNestedObject(content, 'REFRESH_CANDIDATES:', commands);

    // Parse UPDATE_FILTERS commands (with nested object support)
    this.parseCommandWithNestedObject(content, 'UPDATE_FILTERS:', commands);

    // Parse ADD_TASK commands (with nested object support)
    this.parseCommandWithNestedObject(content, 'ADD_TASK:', commands);

    // Parse REMOVE_TASK commands
    const removeTaskMatches = content.matchAll(/REMOVE_TASK:\s*({[^}]+})/g);
    for (const match of removeTaskMatches) {
      try {
        const data = JSON.parse(match[1]);
        commands.push({ type: 'REMOVE_TASK', data });
      } catch (e) {
        this.logger.warn('Failed to parse REMOVE_TASK command:', e);
      }
    }

    // Parse TOGGLE_TASK commands
    const toggleTaskMatches = content.matchAll(/TOGGLE_TASK:\s*({[^}]+})/g);
    for (const match of toggleTaskMatches) {
      try {
        const data = JSON.parse(match[1]);
        commands.push({ type: 'TOGGLE_TASK', data });
      } catch (e) {
        this.logger.warn('Failed to parse TOGGLE_TASK command:', e);
      }
    }

    // Parse ARCHIVE_GOAL commands
    const archiveMatches = content.matchAll(/ARCHIVE_GOAL:\s*({[^}]+})/g);
    for (const match of archiveMatches) {
      try {
        const data = JSON.parse(match[1]);
        commands.push({ type: 'ARCHIVE_GOAL', data });
      } catch (e) {
        this.logger.warn('Failed to parse ARCHIVE_GOAL command:', e);
      }
    }

    return commands;
  }

  /**
   * Sanitize command data by removing fields that should only be added by the backend.
   *
   * This prevents LLMs from accidentally including fields like proposalType and
   * awaitingConfirmation in their output.
   *
   * @param commands - Array of parsed commands to sanitize
   * @returns Sanitized commands with backend-only fields removed
   */
  sanitizeCommands(commands: ParsedCommand[]): ParsedCommand[] {
    const fieldsToRemove = ['proposalType', 'awaitingConfirmation'];

    return commands.map((cmd) => {
      if (cmd.data && typeof cmd.data === 'object') {
        const sanitized = { ...cmd.data };
        for (const field of fieldsToRemove) {
          delete sanitized[field];
        }
        return { ...cmd, data: sanitized };
      }
      return cmd;
    });
  }

  /**
   * Determine proposalType based on command type.
   *
   * - REFRESH_CANDIDATES uses 'accept_decline' (simple yes/no action)
   * - All other commands use 'confirm_edit_cancel' (three-button flow)
   *
   * @param commandType - The type of command
   * @returns The appropriate proposal type for UI rendering
   */
  getProposalTypeForCommand(commandType: CommandType | string): ProposalType {
    if (commandType === 'REFRESH_CANDIDATES') {
      return 'accept_decline';
    }
    return 'confirm_edit_cancel';
  }

  /**
   * Remove command markers from content for display.
   *
   * Strips all command blocks (CREATE_GOAL, UPDATE_*, etc.) from the content
   * to produce clean text for display to users.
   *
   * @param content - The content to clean
   * @returns Content with all command blocks removed
   */
  cleanCommandsFromContent(content: string): string {
    let cleaned = content;

    // Remove commands with nested objects support (process in reverse to avoid index shifting)
    const nestedCommands = [
      'CREATE_GOAL:',
      'UPDATE_FILTERS:',
      'ADD_TASK:',
      'UPDATE_SEARCHTERM:',
      'REFRESH_CANDIDATES:',
    ];

    for (const commandPrefix of nestedCommands) {
      cleaned = this.removeNestedCommandFromContent(cleaned, commandPrefix);
    }

    // Remove simple non-nested commands
    cleaned = cleaned
      .replace(/CREATE_SUBGOAL:\s*{[^}]+}/g, '')
      .replace(/UPDATE_PROGRESS:\s*{[^}]+}/g, '')
      .replace(/UPDATE_TITLE:\s*{[^}]+}/g, '')
      .replace(/UPDATE_TARGET_BALANCE:\s*{[^}]+}/g, '')
      .replace(/UPDATE_TARGET_DATE:\s*{[^}]+}/g, '')
      .replace(/REMOVE_TASK:\s*{[^}]+}/g, '')
      .replace(/TOGGLE_TASK:\s*{[^}]+}/g, '')
      .replace(/ARCHIVE_GOAL:\s*{[^}]+}/g, '')
      .trim();

    // Clean up empty code blocks left behind after removing commands
    cleaned = this.cleanupEmptyBlocks(cleaned);

    return cleaned;
  }

  /**
   * Generate a markdown preview of goals to be created or changes to be applied.
   *
   * Handles both:
   * - Single goal data object (new format from EXTRACT_DATA)
   * - Array of commands (legacy format)
   *
   * @param data - Single goal data object or array of parsed commands
   * @returns Markdown-formatted preview string
   */
  generateGoalPreview(data: GoalData | ParsedCommand[]): string {
    let preview = '';

    // Handle single goal data object (new format)
    if (!Array.isArray(data)) {
      return this.generateSingleGoalPreview(data);
    }

    // Handle old command-based format
    const commands = data;
    const mainGoals = commands.filter((c) => c.type === 'CREATE_GOAL');
    const subgoals = commands.filter((c) => c.type === 'CREATE_SUBGOAL');
    const updateCommands = commands.filter(
      (c) =>
        c.type.startsWith('UPDATE_') ||
        c.type === 'REFRESH_CANDIDATES' ||
        c.type === 'ARCHIVE_GOAL' ||
        c.type === 'ADD_TASK' ||
        c.type === 'REMOVE_TASK' ||
        c.type === 'TOGGLE_TASK',
    );

    // Handle update/modification commands first
    if (updateCommands.length > 0) {
      preview += `## Changes to Apply\n\n`;
      preview += this.generateUpdateCommandsPreview(updateCommands);
    }

    // Add main goals
    for (const cmd of mainGoals) {
      preview += this.generateMainGoalPreview(cmd.data);
    }

    // Add subgoals grouped by parent
    if (subgoals.length > 0) {
      preview += this.generateSubgoalsPreview(subgoals);
    }

    return preview.trim();
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  /**
   * Parse a nested JSON object starting after a command keyword.
   *
   * Uses brace counting to properly handle nested objects and arrays.
   */
  private parseNestedJsonObject(
    content: string,
    keywordIndex: number,
  ): { jsonStr: string; endIndex: number } | null {
    let startIndex = content.indexOf('{', keywordIndex);
    if (startIndex === -1) return null;

    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let endIndex = -1;

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
    }

    if (endIndex > startIndex) {
      const jsonStr = content.substring(startIndex, endIndex);
      return { jsonStr, endIndex };
    }

    return null;
  }

  /**
   * Parse a command type with nested object support and add to commands array.
   */
  private parseCommandWithNestedObject(
    content: string,
    commandPrefix: string,
    commands: ParsedCommand[],
  ): void {
    const keywordIndices: number[] = [];
    let searchStart = 0;

    while (true) {
      const keywordIndex = content.indexOf(commandPrefix, searchStart);
      if (keywordIndex === -1) break;
      keywordIndices.push(keywordIndex);
      searchStart = keywordIndex + commandPrefix.length;
    }

    const commandType = commandPrefix.replace(':', '') as CommandType;

    for (const keywordIndex of keywordIndices) {
      const result = this.parseNestedJsonObject(content, keywordIndex);
      if (result) {
        try {
          const data = JSON.parse(result.jsonStr);
          commands.push({ type: commandType, data });
        } catch (e) {
          this.logger.warn(`Failed to parse ${commandType} command:`, e);
        }
      }
    }
  }

  /**
   * Remove a nested command from content, processing in reverse order.
   */
  private removeNestedCommandFromContent(content: string, commandPrefix: string): string {
    let cleaned = content;
    const keywordIndices: number[] = [];
    let searchStart = 0;

    while (true) {
      const keywordIndex = cleaned.indexOf(commandPrefix, searchStart);
      if (keywordIndex === -1) break;
      keywordIndices.push(keywordIndex);
      searchStart = keywordIndex + commandPrefix.length;
    }

    // Process in reverse order to avoid index shifting
    for (let i = keywordIndices.length - 1; i >= 0; i--) {
      const keywordIndex = keywordIndices[i];
      let startIndex = cleaned.indexOf('{', keywordIndex);

      if (startIndex === -1) {
        // Remove just the keyword if no JSON found
        cleaned =
          cleaned.substring(0, keywordIndex) +
          cleaned.substring(keywordIndex + commandPrefix.length);
        continue;
      }

      const result = this.parseNestedJsonObjectFromIndex(cleaned, startIndex);
      if (result && result.endIndex > startIndex) {
        cleaned =
          cleaned.substring(0, keywordIndex) + cleaned.substring(result.endIndex + 1);
      }
    }

    return cleaned;
  }

  /**
   * Parse nested JSON object from a specific starting index.
   */
  private parseNestedJsonObjectFromIndex(
    content: string,
    startIndex: number,
  ): { endIndex: number } | null {
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let endIndex = -1;

    for (let j = startIndex; j < content.length; j++) {
      const char = content[j];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = j + 1;
            break;
          }
        }
      }
    }

    return endIndex > -1 ? { endIndex } : null;
  }

  /**
   * Clean up empty code blocks and excessive whitespace.
   */
  private cleanupEmptyBlocks(content: string): string {
    let cleaned = content;

    // Remove single backticks on their own line (or with whitespace)
    cleaned = cleaned.replace(/^\s*`\s*$/gm, '');
    // Remove empty triple backtick blocks
    cleaned = cleaned.replace(/```\s*```/g, '');
    // Remove any remaining empty code block markers
    cleaned = cleaned.replace(/```\s*\n\s*```/g, '');
    // Clean up excessive newlines (more than 2 consecutive)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    // Trim whitespace from lines
    cleaned = cleaned
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim();

    return cleaned;
  }

  /**
   * Generate preview for a single goal data object.
   */
  private generateSingleGoalPreview(goalData: GoalData): string {
    let preview = '';

    preview += `## ${goalData.title}\n`;
    if (goalData.description) {
      preview += `${goalData.description}\n`;
    }

    if (goalData.type === 'action' && goalData.tasks) {
      preview += `**Tasks:**\n`;
      for (const task of goalData.tasks) {
        preview += `- ${task.title || task}\n`;
      }
    }

    if (goalData.type === 'finance') {
      preview += `**Target Balance:** $${goalData.targetBalance?.toLocaleString()}\n`;
      if (goalData.currentBalance !== undefined) {
        preview += `**Current Balance:** $${goalData.currentBalance?.toLocaleString()}\n`;
      }
    }

    if (goalData.type === 'item') {
      if (goalData.budget) {
        preview += `**Budget:** $${goalData.budget?.toLocaleString()}\n`;
      }

      // Vehicle goals: display searchTerm (retailerFilters auto-generated)
      if (goalData.category === 'vehicle' && goalData.searchTerm) {
        preview += `\n**Search Query:** ${goalData.searchTerm}\n`;
        preview += `Retailer-specific filters will be generated automatically.\n`;
      }

      // Non-vehicle goals: display structured searchFilters
      if (goalData.searchFilters && goalData.category !== 'vehicle') {
        preview += this.generateSearchFiltersPreview(goalData);
      }
    }

    if (goalData.targetDate) {
      preview += `**Target Date:** ${goalData.targetDate}\n`;
    }

    return preview;
  }

  /**
   * Generate preview for search filters based on category.
   */
  private generateSearchFiltersPreview(goalData: GoalData): string {
    let preview = '';
    const sf = goalData.searchFilters;

    if (!sf) return preview;

    if (goalData.category === 'technology') {
      preview += `\n**Technology Details:**\n`;
      if (sf.brands && sf.brands.length > 0) {
        preview += `- Brands: ${sf.brands.join(', ')}\n`;
      }
      if (sf.minRam) {
        preview += `- Min RAM: ${sf.minRam}\n`;
      }
      if (sf.minStorage) {
        preview += `- Min Storage: ${sf.minStorage}\n`;
      }
      if (sf.screenSize) {
        preview += `- Screen Size: ${sf.screenSize}\n`;
      }
      if (sf.processor) {
        preview += `- Processor: ${sf.processor}\n`;
      }
      if (sf.gpu) {
        preview += `- GPU: ${sf.gpu}\n`;
      }
    } else if (goalData.category === 'furniture') {
      preview += `\n**Furniture Details:**\n`;
      if (sf.brands && sf.brands.length > 0) {
        preview += `- Brands: ${sf.brands.join(', ')}\n`;
      }
      if (sf.colors && sf.colors.length > 0) {
        preview += `- Colors: ${sf.colors.join(', ')}\n`;
      }
      if (sf.material) {
        preview += `- Material: ${sf.material}\n`;
      }
      if (sf.style) {
        preview += `- Style: ${sf.style}\n`;
      }
      if (sf.dimensions) {
        preview += `- Dimensions: ${sf.dimensions}\n`;
      }
    } else {
      // Generic fallback for other categories (pets, sporting_goods, etc.)
      preview += `\n**Filters:**\n`;
      Object.entries(sf).forEach(([key, value]) => {
        if (key !== 'category' && value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            preview += `- ${key}: ${value.join(', ')}\n`;
          } else {
            preview += `- ${key}: ${value}\n`;
          }
        }
      });
    }

    return preview;
  }

  /**
   * Generate preview for update commands.
   */
  private generateUpdateCommandsPreview(updateCommands: ParsedCommand[]): string {
    let preview = '';

    for (const cmd of updateCommands) {
      const cmdData = cmd.data;

      switch (cmd.type) {
        case 'UPDATE_TITLE':
          preview += `**Change Goal Title**\n`;
          preview += `New title: "${cmdData.title}"\n\n`;
          break;

        case 'UPDATE_TARGET_BALANCE':
          preview += `**Update Target Balance**\n`;
          preview += `New target: $${cmdData.targetBalance?.toLocaleString()}\n\n`;
          break;

        case 'UPDATE_TARGET_DATE':
          preview += `**Update Target Date**\n`;
          preview += `New target date: ${cmdData.targetDate}\n\n`;
          break;

        case 'UPDATE_SEARCHTERM':
          preview += `**Update Search Criteria**\n`;
          preview += `New search query: "${cmdData.searchTerm}"\n`;
          preview += `*Retailer-specific filters will be regenerated automatically.*\n\n`;
          break;

        case 'UPDATE_FILTERS':
          preview += `**Update Search Filters**\n`;
          const filters = cmdData.filters;
          if (filters) {
            if (filters.zip) preview += `- ZIP: ${filters.zip}\n`;
            if (filters.distance) preview += `- Distance: ${filters.distance} miles\n`;
            if (filters.yearMin || filters.yearMax) {
              preview += `- Year: ${filters.yearMin || '?'} - ${filters.yearMax || '?'}\n`;
            }
            if (filters.maxPrice) {
              preview += `- Max Price: $${filters.maxPrice?.toLocaleString()}\n`;
            }
            if (filters.mileageMax) {
              preview += `- Max Mileage: ${filters.mileageMax?.toLocaleString()}\n`;
            }
            if (filters.drivetrain) preview += `- Drivetrain: ${filters.drivetrain}\n`;
            if (filters.exteriorColor) preview += `- Color: ${filters.exteriorColor}\n`;
          }
          preview += `\n`;
          break;

        case 'UPDATE_PROGRESS':
          preview += `**Update Progress**\n`;
          preview += `Completion: ${cmdData.completionPercentage}%\n\n`;
          break;

        case 'REFRESH_CANDIDATES':
          preview += `**Refresh Candidates**\n`;
          preview += `Find new candidates using current search criteria.\n\n`;
          break;

        case 'ARCHIVE_GOAL':
          preview += `**Archive Goal**\n`;
          preview += `This goal will be archived.\n\n`;
          break;

        case 'ADD_TASK':
          preview += `**Add Task**\n`;
          preview += `- ${cmdData.task?.title || 'New task'}\n\n`;
          break;

        case 'REMOVE_TASK':
          preview += `**Remove Task**\n`;
          preview += `Remove task: ${cmdData.taskId}\n\n`;
          break;

        case 'TOGGLE_TASK':
          preview += `**Toggle Task**\n`;
          preview += `Toggle task: ${cmdData.taskId}\n\n`;
          break;
      }
    }

    return preview;
  }

  /**
   * Generate preview for a main goal from CREATE_GOAL command.
   */
  private generateMainGoalPreview(cmdData: Record<string, any>): string {
    let preview = '';

    preview += `## ${cmdData.title}\n`;
    if (cmdData.description) {
      preview += `${cmdData.description}\n`;
    }
    if (cmdData.deadline) {
      const deadline = new Date(cmdData.deadline);
      preview += `**Deadline:** ${deadline.toLocaleDateString()}\n`;
    }
    if (cmdData.type === 'action' && cmdData.tasks) {
      preview += `**Tasks:**\n`;
      for (const task of cmdData.tasks) {
        preview += `- ${task.title || task}\n`;
      }
    }
    preview += '\n';

    return preview;
  }

  /**
   * Generate preview for subgoals grouped by parent.
   */
  private generateSubgoalsPreview(subgoals: ParsedCommand[]): string {
    let preview = '';

    preview += `### Subgoals\n`;

    // Group subgoals by parent
    const subgoalsByParent: Record<string, any[]> = {};
    for (const cmd of subgoals) {
      const parent = cmd.data.parentGoalId;
      if (!subgoalsByParent[parent]) {
        subgoalsByParent[parent] = [];
      }
      subgoalsByParent[parent].push(cmd.data);
    }

    // Display subgoals under each parent
    for (const [parentTitle, goals] of Object.entries(subgoalsByParent)) {
      preview += `\n**Under "${parentTitle}":**\n`;
      for (const goal of goals) {
        preview += `- ${goal.title}`;
        if (goal.description) {
          preview += `: ${goal.description}`;
        }
        preview += '\n';
      }
    }

    return preview;
  }
}
