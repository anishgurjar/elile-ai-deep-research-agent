const skill = `---
name: output-contract
description: Use when producing a final response — defines strict response formats and ensures the agent never mixes answering with asking for more information.
---

# output-contract

## Overview
This skill defines the response contract for the orchestrator agent so outputs are consistent and actionable.

## When to Use
- Any time the agent is about to produce a final answer
- Any time the agent is about to ask clarifying questions

## Output — choose exactly ONE path

### If you CAN answer:
- Lead with the answer directly (Yes / No / a specific value / a short summary)
- Support with reasoning or evidence as needed
- Do NOT ask follow-up questions after providing an answer

### If you CANNOT answer (missing critical info):
- First line: **"I cannot answer until I have some more information"**
- Then ask up to 4 targeted clarifying questions — keep them simple and direct
- Do NOT provide a partial answer alongside questions

### If technical issues prevent answering:
- First line: **"I cannot answer that at this time due to technical constraints"**

## Style Rules
- Be concise and direct
- Lead with what the user needs to know or do
- Use markdown for structure when the response is complex
- Never mix modes (answer + questions in the same response)
`;

export default skill;
