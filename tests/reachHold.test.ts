import {
  bindReachStepButton,
  REACH_HOLD_DELAY_MS,
  REACH_HOLD_REPEAT_MS,
} from '../src/app/CreativeUi';

function mouseEvent(type: string, detail: number, button = 0): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    button: { value: button },
    detail: { value: detail },
  });
  return event;
}

describe('reach button hold-to-repeat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('steps immediately, then repeats quickly until mouse-up', () => {
    const button = new EventTarget() as HTMLButtonElement;
    const releaseTarget = new EventTarget();
    const steps: number[] = [];
    bindReachStepButton(button, 1, (direction) => steps.push(direction), releaseTarget);

    button.dispatchEvent(mouseEvent('mousedown', 0));
    expect(steps).toEqual([1]);

    vi.advanceTimersByTime(REACH_HOLD_DELAY_MS - 1);
    expect(steps).toEqual([1]);
    vi.advanceTimersByTime(1 + REACH_HOLD_REPEAT_MS * 3);
    expect(steps).toEqual([1, 1, 1, 1, 1]);

    releaseTarget.dispatchEvent(mouseEvent('mouseup', 0));
    vi.advanceTimersByTime(REACH_HOLD_REPEAT_MS * 3);
    expect(steps).toHaveLength(5);
  });

  it('does not double-step when the mouse click follows release', () => {
    const button = new EventTarget() as HTMLButtonElement;
    const releaseTarget = new EventTarget();
    const onStep = vi.fn();
    bindReachStepButton(button, -1, onStep, releaseTarget);

    button.dispatchEvent(mouseEvent('mousedown', 0));
    releaseTarget.dispatchEvent(mouseEvent('mouseup', 0));
    button.dispatchEvent(mouseEvent('click', 1));

    expect(onStep).toHaveBeenCalledOnce();
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it('keeps keyboard activation to one step and ignores non-primary mouse presses', () => {
    const button = new EventTarget() as HTMLButtonElement;
    const releaseTarget = new EventTarget();
    const onStep = vi.fn();
    bindReachStepButton(button, 1, onStep, releaseTarget);

    button.dispatchEvent(mouseEvent('mousedown', 0, 2));
    button.dispatchEvent(mouseEvent('click', 0));
    vi.advanceTimersByTime(REACH_HOLD_DELAY_MS + REACH_HOLD_REPEAT_MS);

    expect(onStep).toHaveBeenCalledOnce();
    expect(onStep).toHaveBeenCalledWith(1);
  });
});
