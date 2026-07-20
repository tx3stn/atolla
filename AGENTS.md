# atolla development guidelines

This project uses Valdi, Typescript, biome.js (for linting/formatting) and webdriver.io for end to end tests.

## Approach

* test driven development using red green refactor approach
* create unit tests for all new functionality
* errors should use the error constants defined in `atolla/src/errors`, so packages can define consistent errors, and tests can verify the correct error is thrown
* components should be kept simple
* use dependency injection to pass stores/services to components so they are easy to test and logic is kept simple
* styling should ALWAYS use the theme so things can be easily tweaked
* don't add comments unless they explain a decision that might not be obvious

## Tests

### unit

Unit tests should live next to the files they are testing and are written with bun. Run with `bun run test`

### component

Component tests are required when the thing being tested imports valdi as these need to be run with bazel. They are written with jasmine & valid and live in `atolla/test`. Run with `bun run test:components`

### end to end tests

End to tests use webdriver.io.

#### page object model

All interactions should use the page object model.
Locators should be defined once in the page object as a prviate constant.
Components should use an accessibilityId so they can be interacted with.

#### test actions

Follow the Arrange, Act, Assert pattern.
Test actions should be kept small and simple so the behvaiour is easy to understand.
They need to work cross platform, on ios and android.

### native

Native code should always be tested too, and will need to be run via bazel.

Zig tests can be run with `bun run test:zig`.
Kotlin tests can be run with `bun run test:android`.

## Commands

Commands are defined in @package.json and run with `bun run ...`

* `bun run check` should be run after changes to make sure they work.
* `bun run check:full` runs all checks but the end to end tests might be too slow for your requirements.

## App

Is built with typescript and valdi.

### 🚨 Critical: Valdi is NOT React

Valdi is fundamentally different from React.

#### Common AI Hallucinations

##### 1. useState Hook (Doesn't Exist)

```typescript
// ❌ WRONG - useState doesn't exist in Valdi
const [count, setCount] = useState(0);
```

**Correct Valdi pattern:**

```typescript
// ✅ CORRECT - Use StatefulComponent with setState()
import { StatefulComponent } from 'valdi_core/src/Component';

class Counter extends StatefulComponent<ViewModel, State> {
  state = { count: 0 };
  
  incrementCount() {
    this.setState({ count: this.state.count + 1 }); // setState auto re-renders
  }
  
  onRender() {
    <button 
      title={`Count: ${this.state.count}`}
      onPress={this.incrementCount}
    />;
  }
}
```

##### 2. useEffect Hook (Doesn't Exist)

```typescript
// ❌ WRONG - useEffect doesn't exist in Valdi
useEffect(() => {
  fetchData();
}, []);
```

**Correct Valdi pattern:**

```typescript
// ✅ CORRECT - Use lifecycle methods
import { StatefulComponent } from 'valdi_core/src/Component';

class DataComponent extends StatefulComponent<ViewModel, State> {
  state = { data: null };
  
  onCreate() {
    this.fetchData();
  }
  
  onViewModelUpdate(prevViewModel: ViewModel) {
    if (this.viewModel.id !== prevViewModel.id) {
      this.fetchData();
    }
  }
  
  async fetchData() {
    const data = await fetch(...);
    this.setState({ data });
  }
}
```

##### 3. Functional Components (Don't Exist)

```typescript
// ❌ WRONG - Functional components don't exist in Valdi
const Button = ({ title, onPress }) => {
  return <button title={title} onPress={onPress} />;
};
```

**Correct Valdi pattern:**

```typescript
// ✅ CORRECT - Use class-based components
import { Component } from 'valdi_core/src/Component';

interface ButtonViewModel {
  title: string;
  onPress: () => void;
}

class Button extends Component<ButtonViewModel> {
  onRender() {
    <button 
      title={this.viewModel.title} 
      onPress={this.viewModel.onPress} 
    />;
  }
}
```

##### 4. Returning JSX from onRender()

```typescript
// ❌ WRONG - onRender returns void, not JSX
class MyComponent extends Component {
  onRender() {
    return <view />; // Compiler error!
  }
}
```

**Correct Valdi pattern:**

```typescript
// ✅ CORRECT - JSX is a statement, onRender returns void
class MyComponent extends Component {
  onRender() {
    <view />; // No return statement
  }
}
```

##### 5. useContext Hook (Doesn't Exist)

```typescript
// ❌ WRONG - useContext doesn't exist in Valdi
const theme = useContext(ThemeContext);
```

**Correct Valdi pattern:**

```typescript
// ✅ CORRECT - Use Provider pattern with HOC
import { createProviderComponentWithKeyName } from 'valdi_core/src/provider/createProvider';
import { withProviders } from 'valdi_core/src/provider/withProviders';
import { ProvidersValuesViewModel } from 'valdi_core/src/provider/withProviders';
import { Component } from 'valdi_core/src/Component';

// Define theme service
class Theme {
  primary = '#FFFC00';
}

// Create provider
const ThemeProvider = createProviderComponentWithKeyName<Theme>('ThemeProvider');

// Provide value
class AppRoot extends Component {
  private theme = new Theme();
  
  onRender() {
    <ThemeProvider value={this.theme}>
      <ThemedComponentWithProvider />
    </ThemeProvider>;
  }
}

// Consume with HOC
interface ThemedViewModel extends ProvidersValuesViewModel<[Theme]> {}

class ThemedComponent extends Component<ThemedViewModel> {
  onRender() {
    const [theme] = this.viewModel.providersValues;
    <view backgroundColor={theme.primary} />;
  }
}

const ThemedComponentWithProvider = withProviders(ThemeProvider)(ThemedComponent);
```

#### Quick Reference: React vs Valdi

| Concept | React Pattern | Valdi Pattern |
|---------|---------------|---------------|
| **Component** | `const C = () => {}` | `class C extends StatefulComponent {}` |
| **State** | `useState(0)` | `state = { count: 0 }` |
| **Update State** | `setCount(1)` | `this.setState({ count: 1 })` |
| **Props** | `props.title` | `this.viewModel.title` |
| **Mount effect** | `useEffect(() => {}, [])` | `onCreate() {}` |
| **Update effect** | `useEffect(() => {}, [dep])` | `onViewModelUpdate(prev) {}` |
| **Unmount effect** | `useEffect(() => () => {}, [])` | `onDestroy() {}` |
| **Context** | `useContext(Ctx)` | `withProviders(Provider)(Component) + this.viewModel.providersValues` |
| **Render** | `return <view />` | `<view />; // statement, returns void` |

### native

Native things that need to run cross platform are written in zig, to ensure they behave the same consistently.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
