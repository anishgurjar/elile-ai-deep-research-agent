# ELILEAI Deep Research Backend

A multi-agent system built using LangGraph that provides deep research answers by routing questions to specialized agents.

## How It Works

1. **Question Routing**: When a user asks a question, the supervisor agent analyzes the content and determines which specialized agent(s) should respond.

2. **Agent Processing**: The selected agent(s) process the question using their specialized knowledge and respond with relevant information.

3. **Response Coordination**: The supervisor agent coordinates responses from multiple agents when needed and provides the final answer to the user.

4. **Memory Persistence**: The system maintains conversation history using LangGraph's checkpointing mechanism, allowing for contextual follow-up questions.

## Technology Stack

- **Framework**: LangGraph for multi-agent orchestration
- **Language Models**: OpenAI GPT-4o (supervisor) and GPT-4o-mini (agents)
- **Language**: TypeScript with ESM modules
- **State Management**: LangGraph's built-in memory system

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run LangSmith evals (in the cloud, requires API key)
npm run evals

# Run tests
npm test

# Run integration tests
npm run test:int

# Build for production
npm run build
```

Note: For targeted local runs, pass `exampleIds` directly to `loadQAExamplesOrThrow(...)` inside the specific `*.eval.ts` file you want to narrow (keeps `npm run evals` running all suites/datasets, while only that one suite is filtered).

## Configuration

Copy `.env.example` to `.env` and fill in your API keys. See the root `.env.example` for all required variables.

You will also need a LangSmith account for observability and evals.
