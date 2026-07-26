import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldMapUi, type WorldMapContext } from '../src/app/WorldMapUi';

type Listener = (event: TestEvent) => void;

class TestEvent {
  bubbles: boolean;
  cancelable: boolean;
  code = '';
  key = '';
  shiftKey = false;
  clientX = 0;
  clientY = 0;
  currentTarget: unknown;
  target: unknown;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(
    public type: string,
    init: Partial<TestEvent> = {},
  ) {
    this.bubbles = !!init.bubbles;
    this.cancelable = !!init.cancelable;
    Object.assign(this, init);
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

class TestEventTarget {
  parentNode: TestEventTarget | null = null;
  private listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: TestEvent): boolean {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
      if (event.propagationStopped) break;
    }
    if (event.bubbles && !event.propagationStopped && this.parentNode) {
      return this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }
}

class TestClassList {
  private tokens = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) this.tokens.add(token);
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) this.tokens.delete(token);
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }

  toggle(token: string, force?: boolean): boolean {
    if (force === true) {
      this.tokens.add(token);
      return true;
    }
    if (force === false) {
      this.tokens.delete(token);
      return false;
    }
    if (this.tokens.has(token)) {
      this.tokens.delete(token);
      return false;
    }
    this.tokens.add(token);
    return true;
  }

  setFromString(value: string): void {
    this.tokens = new Set(value.split(/\s+/).filter(Boolean));
  }

  toString(): string {
    return Array.from(this.tokens).join(' ');
  }
}

class TestHTMLElement extends TestEventTarget {
  children: TestHTMLElement[] = [];
  style: Record<string, string> = {};
  classList = new TestClassList();
  title = '';
  private attrs = new Map<string, string>();
  private text = '';
  private disabledValue = false;
  private tabIndexValue = -1;

  constructor(
    public tagName: string,
    private readonly ownerDocument: TestDocument,
  ) {
    super();
  }

  append(...nodes: TestHTMLElement[]): void {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: TestHTMLElement[]): void {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }

  remove(): void {
    const parent = this.parentNode;
    if (!(parent instanceof TestHTMLElement) && !(parent instanceof TestDocument)) return;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  click(): void {
    this.dispatchEvent(new TestEvent('click', { bubbles: true }));
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    if (name === 'class') this.classList.setFromString(value);
    if (name === 'tabindex') this.tabIndexValue = Number(value);
    if (name === 'disabled') this.disabledValue = true;
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
    if (name === 'disabled') this.disabledValue = false;
  }

  querySelector(selector: string): TestHTMLElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): TestHTMLElement[] {
    const selectors = selector
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const matches = (node: TestHTMLElement, candidate: string): boolean => {
      if (candidate.startsWith('.')) return node.classList.contains(candidate.slice(1));
      if (candidate.startsWith('#')) return node.id === candidate.slice(1);
      return node.tagName.toLowerCase() === candidate.toLowerCase();
    };
    const result: TestHTMLElement[] = [];
    const visit = (node: TestHTMLElement): void => {
      for (const child of node.children) {
        if (selectors.some((candidate) => matches(child, candidate))) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.text = value;
  }

  get className(): string {
    return this.classList.toString();
  }

  set className(value: string) {
    this.classList.setFromString(value);
    this.attrs.set('class', value);
  }

  get id(): string {
    return this.attrs.get('id') ?? '';
  }

  set id(value: string) {
    this.attrs.set('id', value);
  }

  get disabled(): boolean {
    return this.disabledValue;
  }

  set disabled(value: boolean) {
    this.disabledValue = value;
    if (value) this.attrs.set('disabled', '');
    else this.attrs.delete('disabled');
  }

  get tabIndex(): number {
    return this.tabIndexValue;
  }

  set tabIndex(value: number) {
    this.tabIndexValue = value;
    this.attrs.set('tabindex', String(value));
  }
}

class TestHTMLCanvasElement extends TestHTMLElement {
  width = 0;
  height = 0;
  private readonly context2d = makeContext2d();

  constructor(ownerDocument: TestDocument) {
    super('CANVAS', ownerDocument);
  }

  getContext(type: string): CanvasRenderingContext2D | null {
    return type === '2d' ? this.context2d : null;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 50, height: 50 };
  }
}

class TestDocument extends TestEventTarget {
  body: TestHTMLElement;
  activeElement: TestHTMLElement | null = null;
  children: TestHTMLElement[];

  constructor() {
    super();
    this.body = new TestHTMLElement('BODY', this);
    this.body.parentNode = this;
    this.children = [this.body];
  }

  createElement(tagName: string): TestHTMLElement {
    if (tagName.toLowerCase() === 'canvas') return new TestHTMLCanvasElement(this);
    return new TestHTMLElement(tagName.toUpperCase(), this);
  }

  querySelector(selector: string): TestHTMLElement | null {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector: string): TestHTMLElement[] {
    return this.body.querySelectorAll(selector);
  }

  getElementById(id: string): TestHTMLElement | null {
    return this.querySelector(`#${id}`);
  }
}

class TestWindow extends TestEventTarget {}

type TestGlobals = {
  document: TestDocument;
  window: TestWindow;
};

function installDom(): TestGlobals {
  const document = new TestDocument();
  const window = new TestWindow();
  document.parentNode = window;
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  vi.stubGlobal('HTMLElement', TestHTMLElement);
  vi.stubGlobal('HTMLCanvasElement', TestHTMLCanvasElement);
  vi.stubGlobal(
    'KeyboardEvent',
    class extends TestEvent {
      constructor(type: string, init: Partial<TestEvent> = {}) {
        super(type, init);
      }
    },
  );
  vi.stubGlobal(
    'MouseEvent',
    class extends TestEvent {
      constructor(type: string, init: Partial<TestEvent> = {}) {
        super(type, init);
      }
    },
  );
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray<ArrayBuffer>,
        public width: number,
        public height: number,
      ) {}
    },
  );
  return { document, window };
}

function makeContext2d(): CanvasRenderingContext2D {
  return {
    putImageData: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    closePath: vi.fn(),
    restore: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    globalAlpha: 1,
    lineWidth: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    font: '',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
}

function baseContext(overrides: Partial<WorldMapContext> = {}): WorldMapContext {
  return {
    center: { x: 10, z: 20 },
    yaw: 0,
    radius: 2,
    sample: () => ({ id: 1, y: 64 }),
    palette: new Map([[1, [80, 120, 140] as const]]),
    title: 'Moonspire Realm',
    landmarks: [
      { name: 'Gatehouse', x: 11, z: 19, found: true },
      { name: 'Hidden Vault', x: 13, z: 20, found: false },
    ],
    tour: [
      { name: 'Arrival', x: 10, z: 20 },
      { x: 12, z: 22 },
    ],
    ...overrides,
  };
}

function buttonByText(text: string): TestHTMLElement {
  const button = Array.from(globalThis.document.querySelectorAll('button')).find(
    (node) => node.textContent === text,
  ) as TestHTMLElement | undefined;
  expect(button).toBeTruthy();
  return button!;
}

describe('createWorldMapUi', () => {
  let dom: TestGlobals;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens as an aria-modal dialog, focuses inside, and restores focus on public close', () => {
    const trigger = dom.document.createElement('button');
    trigger.textContent = 'Open map';
    dom.document.body.append(trigger);
    trigger.focus();

    const ui = createWorldMapUi({
      onSetWaypoint: vi.fn(),
      onClearWaypoint: vi.fn(),
      onClose: vi.fn(),
    });

    expect(ui.toggle(baseContext())).toBe(true);

    const dialog = dom.document.querySelector('.world-map-panel');
    const closeButton = buttonByText('Close map');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dom.document.activeElement).toBe(closeButton);
    expect(dom.document.getElementById('world-map')?.getAttribute('aria-hidden')).toBe('false');

    ui.close();

    expect(ui.isOpen()).toBe(false);
    expect(dom.document.activeElement).toBe(trigger);
    expect(dom.document.getElementById('world-map')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('closes from the close button and Escape while notifying the host callback', () => {
    const trigger = dom.document.createElement('button');
    dom.document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const ui = createWorldMapUi({
      onSetWaypoint: vi.fn(),
      onClearWaypoint: vi.fn(),
      onClose,
    });

    ui.toggle(baseContext());
    buttonByText('Close map').click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dom.document.activeElement).toBe(trigger);

    ui.toggle(baseContext());
    dom.window.dispatchEvent(
      new TestEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(ui.isOpen()).toBe(false);
    expect(dom.document.activeElement).toBe(trigger);
  });

  it('renders a keyboard-reachable destination list and clear control without exposing hidden landmarks', () => {
    const onSetWaypoint = vi.fn();
    const onClearWaypoint = vi.fn();
    const ui = createWorldMapUi({
      onSetWaypoint,
      onClearWaypoint,
      onClose: vi.fn(),
    });

    ui.toggle(baseContext());

    expect(dom.document.body.textContent).not.toContain('Hidden Vault');
    expect(dom.document.body.textContent).toContain(
      '1 undiscovered landmark remains hidden until found.',
    );

    dom.window.dispatchEvent(new TestEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    const gateButton = buttonByText('Gatehouse');
    expect(dom.document.activeElement).toBe(gateButton);

    gateButton.click();
    expect(onSetWaypoint).toHaveBeenCalledWith(11, 19);

    const clearButton = buttonByText('Clear waypoint');
    expect(clearButton.disabled).toBe(false);
    clearButton.click();
    expect(onClearWaypoint).toHaveBeenCalledTimes(1);
  });

  it('retains canvas click placement and click-again clearing', () => {
    const onSetWaypoint = vi.fn();
    const onClearWaypoint = vi.fn();
    const ui = createWorldMapUi({
      onSetWaypoint,
      onClearWaypoint,
      onClose: vi.fn(),
    });

    ui.toggle(baseContext());

    const canvas = dom.document.querySelector('canvas') as TestHTMLCanvasElement;
    canvas.dispatchEvent(new TestEvent('click', { clientX: 25, clientY: 25, bubbles: true }));
    expect(onSetWaypoint).toHaveBeenCalledWith(10, 20);

    canvas.dispatchEvent(new TestEvent('click', { clientX: 25, clientY: 25, bubbles: true }));
    expect(onClearWaypoint).toHaveBeenCalledTimes(1);
  });
});
