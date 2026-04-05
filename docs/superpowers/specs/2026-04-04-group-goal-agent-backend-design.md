# Group Goal Agent / Backend Design

Date: 2026-04-04
Status: Draft for review
Related UI spec: `../../../../neon-goals-ui/docs/superpowers/specs/2026-04-04-group-goal-ui-design.md`

## Summary

This document covers backend and agent-system responsibilities for evolving `GroupGoal` into the main conversational goal-topic model.

The backend already supports real `group` goals. The main gap is not persistence but orchestration:

- the agent currently reasons in a flatter command model
- stack creation is not agent-native
- nested group creation is not fully exposed through subgoal command contracts
- complex multi-goal proposals are not represented as structured draft plans

This design adds a planner-oriented proposal flow that can compose a full structure before asking the user to confirm it.

## Existing Backend State

### Already supported

- real `group` goals in Prisma schema
- `POST /goals/group`
- AI command execution supports top-level `CREATE_GOAL` with `type: "group"`
- product extraction already creates a `GroupGoal` with item subgoals
- item goals already support `stackId` and `stackOrder`

### Current gaps

- `CREATE_SUBGOAL` prompt contracts support only `item|finance|action`
- nested group creation is not available through normal AI subgoal flow
- there is no agent-native stack command surface
- multi-goal structure proposals are not modeled as first-class objects
- no implemented numeric confidence model drives discuss vs propose behavior

## Domain Model

### GroupGoal

`GroupGoal` is the root workspace for a shared outcome.

Examples:

- `Upgrade My Car`
- `Japan Trip 2026`
- `Home Office Setup`

It may contain:

- direct `item` children
- direct `finance` children
- direct `action` children
- nested `group` children when needed

### Stack

A stack is not a new domain entity replacing goals.

A stack is a contextual grouping layer over sibling goals that all share:

- the same goal type
- the same local subtopic

Examples:

- `Supercharger Parts` stack
- `Car Audio Parts` stack

Non-example:

- a single generic `Car Parts` stack combining unrelated same-type goals only because they are all items

## Agent Planning Model

### Key principle

The agent should build a draft structure for the user's intended outcome rather than choosing one isolated command.

### Agent stages

1. `Intent detection`
- determine whether the user is:
  - discussing existing goals
  - exploring
  - explicitly asking to create something new

2. `Context merge`
- inspect existing goals and groups
- prefer regrouping or extending existing related structures before duplicating work

3. `Draft structure planning`
- decide whether a root `GroupGoal` is warranted
- identify direct child goals by type
- identify same-type local subclusters that should be stacked
- identify ambiguities in grouping boundaries

4. `Proposal threshold`
- remain in discussion mode until structure confidence is sufficient
- if the user is explicit and confidence is high enough, propose directly

5. `Proposal`
- return a draft structure with uncertainty annotations

6. `Execution`
- create root group if needed
- create children
- apply stack metadata to same-type sibling clusters
- redirect user into the resulting group goal when appropriate

## Confidence Model

Confidence should be internal only and numeric in the range `0..1`.

Confidence should exist for at least:

- `creation_confidence`
  - should the system continue discussing or propose a new structure?
- `stack_boundary_confidence`
  - should these same-type siblings be grouped into one stack?

Confidence should not be exposed directly to the user.

The user sees:

- a proposal
- notes about uncertain structure

### Behavioral rules

- if user intent is explicit and `creation_confidence` is high, propose creation
- if intent is exploratory or ambiguous, remain in discussion mode
- if `stack_boundary_confidence` is high, propose the stack directly
- if `stack_boundary_confidence` is lower but still useful, include the stack in the draft with a note
- do not group goals merely because they share the same type

## Proposal Contract

The current command model is too flat for this feature. The service should support a structured proposal payload representing a draft plan graph.

### Proposal content

A complex proposal should include:

- root topic/group
- ordered child nodes
- optional stack groupings
- notes about uncertainty
- enough metadata for the frontend to render an indented outline

### Example conceptual payload

```json
{
  "kind": "goal_structure_proposal",
  "root": {
    "type": "group",
    "title": "Upgrade My Car",
    "description": "Overall project for parts, budget, and execution"
  },
  "children": [
    {
      "kind": "stack",
      "stackType": "item",
      "title": "Supercharger Parts",
      "members": [
        { "type": "item", "title": "Pulley Kit" },
        { "type": "item", "title": "Injectors" },
        { "type": "item", "title": "Intercooler Piping" }
      ]
    },
    {
      "kind": "stack",
      "stackType": "item",
      "title": "Car Audio Parts",
      "members": [
        { "type": "item", "title": "Head Unit" },
        { "type": "item", "title": "Amplifier" },
        { "type": "item", "title": "Door Speakers" }
      ]
    },
    { "type": "finance", "title": "Car Upgrade Budget" },
    { "type": "action", "title": "Install Supercharger" },
    { "type": "action", "title": "Tune and Test" }
  ],
  "notes": [
    "The wiring kit may belong in Car Audio Parts or as a standalone item."
  ]
}
```

This does not have to become the public API shape exactly, but the service needs an internal structure at least this expressive.

## Command / Tooling Requirements

The frontend should only expose edits that backend tooling can execute. To support the target UX, the backend and agent command layer need compatible operations.

### Required capabilities

- create top-level `GroupGoal`
- create nested `GroupGoal` when allowed
- create mixed child goals under a group
- assign or update stack metadata for same-type sibling clusters
- move a child between standalone and stacked state
- split a stack into two stacks
- merge two stacks
- regroup existing related goals into a new or existing `GroupGoal`

### Current incompatibilities to resolve

- `CREATE_SUBGOAL` does not support `group`
- prompt contracts still describe a simpler world than the schema/executor supports
- stack creation is currently implicit item metadata, not an agent-level operation

## Suggested Command Evolution

At minimum, one of these must happen:

1. extend existing commands
- allow `CREATE_SUBGOAL` with `type: "group"`
- allow stack metadata assignment during goal creation or update

2. introduce explicit structure commands
- `CREATE_GROUP_GOAL`
- `CREATE_STACK`
- `MOVE_GOAL`
- `SPLIT_STACK`
- `MERGE_STACKS`

Recommendation:

- avoid introducing too many UI-visible commands first
- use richer internal proposal objects plus a backend execution layer that expands them into existing goal creation operations

That keeps the user-facing proposal clean while allowing the backend to stay flexible.

## Existing Goal Reuse

The agent should bias toward existing related goals.

Rules:

- if the user is discussing an existing goal, do not default to new-goal creation
- if related goals already exist, prefer:
  - adding a new child to an existing group
  - regrouping related standalone goals into a group
  - adding stack metadata to same-type siblings within a group

If regrouping is proposed, the proposal must make that transformation explicit.

## Nested Groups

Nested groups should be allowed only when they improve clarity materially.

Use cases:

- large initiatives with clear subprojects
- existing topic with a coherent new subprogram

Do not use nested groups when a simpler direct-child structure is enough.

## Execution Model

On confirm, backend execution should proceed in a stable order:

1. create root group if needed
2. create nested groups if any
3. create child goals
4. assign stack metadata
5. return the resulting structure and redirect target

This avoids partial references to not-yet-created parents.

## Demo / Seed Data

Demo data should be backed by real backend rows, not frontend-only structures that route to nonexistent goal IDs.

For this feature:

- demo group examples should exist as real goals
- demo goal chat endpoints should resolve against real goal IDs owned by the demo user
- demo stack examples should be represented through real child goals with valid stack metadata

## Recommendation

Implement the backend around these principles:

- `GroupGoal` is the main persistent topic object
- stacks remain metadata/grouping over same-type sibling goals
- agent planning composes a draft graph before proposing
- confidence is internal, numeric, and not user-visible
- proposal payloads must support uncertainty annotations
- backend execution must support the edit affordances the frontend presents

## Open Questions

- Should stack handling remain implicit metadata only, or gain an explicit command layer?
- Should regrouping existing goals preserve original chat/history associations or open a new group-centric planning flow?
- Should nested group creation ship in the first release or after edit tooling is proven out?
