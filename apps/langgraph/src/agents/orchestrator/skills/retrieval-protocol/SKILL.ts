const skill = `---
name: retrieval-protocol
description: Use when answering questions that require grounding in source material or structured reasoning.
---

# retrieval-protocol

## Overview
This skill defines a structured approach to reasoning through questions using available knowledge and sources.

## When to Use
- Any question requiring factual grounding or policy/guideline reasoning
- "Is this eligible?", "What is required?", or "How does X work?" questions

## Protocol

### Step 1 — Classify the request
Determine what type of question this is and what sources would be relevant.

### Step 2 — Decompose into concepts
Break the question into smaller parts. Reason about each separately.

### Step 3 — Reason from sources
Ground your answer in available knowledge. If you lack sufficient evidence, say so clearly.

### Step 4 — Determine missing information
If critical details are missing that would change the answer, ask targeted clarifying questions (up to 4).

### Step 5 — Answer
Provide a direct, well-supported answer. If the answer is "No", explain what would need to change.
`;

export default skill;
