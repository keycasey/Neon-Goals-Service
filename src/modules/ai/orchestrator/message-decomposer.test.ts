import { describe, expect, it } from 'bun:test';
import { decomposeUserMessage } from './message-decomposer';

describe('decomposeUserMessage', () => {
  it('classifies pure questions as answer work only', () => {
    expect(decomposeUserMessage('Can I afford a Honda Passport?')).toEqual([
      {
        kind: 'answer_question',
        assignedAgent: 'finances',
        input: { text: 'Can I afford a Honda Passport?' },
      },
    ]);
  });

  it('splits mixed item, action, and finance requests', () => {
    expect(
      decomposeUserMessage('I want a Wahl trimmer, add voice transcription to this site, and can I afford a Passport?'),
    ).toEqual([
      {
        kind: 'create_goal',
        assignedAgent: 'items',
        input: { text: 'I want a Wahl trimmer' },
      },
      {
        kind: 'create_goal',
        assignedAgent: 'actions',
        input: { text: 'add voice transcription to this site' },
      },
      {
        kind: 'answer_question',
        assignedAgent: 'finances',
        input: { text: 'can I afford a Passport?' },
      },
    ]);
  });
});
