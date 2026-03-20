# atola development guidlines

This project uses Valdi, Typescript, biome.js (for linting/formatting) and webdriver.io for end to end tests.

## Approach

* test driven development using red green refactor approach
* create unit tests for all new functionality
* error should use the error constants defined in `atolla/src/errors`, so packages can define consistent errors, and tests can verify the correct error is thrown
* components should be kept simple
* use dependency injection to pass stores/services to components so they are easy to test and logic is kept simple
* styling should use the theme so thigns can be easily tweaked

## Commands

* `bun run check` - run linting, formatting, compile and unit tests
* `bun run test:e2e` - run end to end tests

## 🚨 Critical: Valdi is NOT React

Valdi is fundamentally different from React.

### Common AI Hallucinations

#### 1. useState Hook (Doesn't Exist)

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

#### 2. useEffect Hook (Doesn't Exist)

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

#### 3. Functional Components (Don't Exist)

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

#### 4. Returning JSX from onRender()

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

#### 5. useContext Hook (Doesn't Exist)

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

### Quick Reference: React vs Valdi

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
