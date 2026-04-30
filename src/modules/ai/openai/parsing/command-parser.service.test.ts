import { describe, expect, it } from 'bun:test';

import { CommandParserService } from './command-parser.service';

describe('CommandParserService command sanitization', () => {
  it('drops CREATE_GOAL commands that contain unresolved placeholder text', () => {
    const service = new CommandParserService();
    const commands = service.parseCommands(
      'CREATE_GOAL: {"type":"item","title":"Honda Passport Search","description":"within [radius] miles of [ZIP]","budget":25000,"category":"vehicle","searchTerm":"Honda Passport within [radius] miles of [ZIP]"}',
    );

    expect(service.sanitizeCommands(commands)).toEqual([]);
  });

  it('keeps complete vehicle CREATE_GOAL commands', () => {
    const service = new CommandParserService();
    const commands = service.parseCommands(
      'CREATE_GOAL: {"type":"item","title":"Honda Passport","description":"AWD Honda Passport non-white within 100 miles of 90210","budget":25000,"category":"vehicle","searchTerm":"Honda Passport AWD non-white under 80000 miles under 25000 within 100 miles of 90210 Touring or Elite"}',
    );

    expect(service.sanitizeCommands(commands)).toHaveLength(1);
    expect(service.sanitizeCommands(commands)[0]).toMatchObject({
      type: 'CREATE_GOAL',
      data: {
        title: 'Honda Passport',
        category: 'vehicle',
      },
    });
  });
});
