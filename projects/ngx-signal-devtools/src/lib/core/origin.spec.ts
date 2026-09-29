import { ownerFromOrigin, parseSignalOrigin, previewValue } from './origin';

describe('parseSignalOrigin', () => {
  it('picks the first user frame and skips devtools and framework frames', () => {
    const stack = [
      'Error: ngx-signal-devtools',
      '    at captureSignalOrigin (http://localhost:4200/node_modules/@vitalie27dev/ngx-signal-devtools/fesm2022/x.mjs:12:5)',
      '    at devSignal (http://localhost:4200/node_modules/@angular/core/fesm2022/core.mjs:10:5)',
      '    at new TodosStore (http://localhost:4200/src/app/todos.store.ts:42:18)',
      '    at new App (http://localhost:4200/src/app/app.ts:8:9)',
    ].join('\n');

    expect(parseSignalOrigin(stack)).toEqual({
      file: 'http://localhost:4200/src/app/todos.store.ts',
      line: 42,
      column: 18,
      functionName: 'new TodosStore',
      label: 'app/todos.store.ts:42',
    });
  });

  it('supports bare frames, webpack prefixes and custom ignore patterns', () => {
    const stack = [
      '    at webpack:///src/app/hidden.ts:1:1',
      '    at webpack:///src/app/visible.ts:7:3',
    ].join('\n');

    expect(parseSignalOrigin(stack, { ignore: ['hidden.ts'] })).toMatchObject({
      file: 'webpack:///src/app/visible.ts',
      line: 7,
      column: 3,
      functionName: null,
      label: 'app/visible.ts:7',
    });
  });

  it('returns null when nothing can be parsed', () => {
    expect(parseSignalOrigin(undefined)).toBeNull();
    expect(parseSignalOrigin('')).toBeNull();
    expect(parseSignalOrigin('Error: no frames here')).toBeNull();
    expect(parseSignalOrigin('    at fn (/node_modules/pkg/index.mjs:1:1)')).toBeNull();
  });
});

describe('ownerFromOrigin', () => {
  it('derives an owner from class-like frames only', () => {
    expect(
      ownerFromOrigin({
        file: 'a.ts',
        line: 1,
        column: 1,
        label: 'a.ts:1',
        functionName: 'new TodosStore',
      }),
    ).toBe('TodosStore');
    expect(
      ownerFromOrigin({
        file: 'a.ts',
        line: 1,
        column: 1,
        label: 'a.ts:1',
        functionName: 'TodosStore.add',
      }),
    ).toBe('TodosStore');
    expect(
      ownerFromOrigin({
        file: 'a.ts',
        line: 1,
        column: 1,
        label: 'a.ts:1',
        functionName: 'createStore',
      }),
    ).toBeNull();
    expect(ownerFromOrigin(null)).toBeNull();
  });
});

describe('previewValue', () => {
  it('renders compact, safe previews without touching large structures', () => {
    expect(previewValue(undefined)).toBe('undefined');
    expect(previewValue(null)).toBe('null');
    expect(previewValue(42)).toBe('42');
    expect(previewValue('hello')).toBe('"hello"');
    expect(previewValue([1, 2])).toBe('[1, 2]');
    expect(previewValue(new Array(50).fill(0))).toBe('Array(50)');
    expect(previewValue(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
    expect(previewValue(new Map([[1, 2]]))).toBe('Map(1)');
    expect(previewValue({ a: 1 })).toBe('{"a":1}');
  });

  it('never throws on circular structures', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(previewValue(circular)).toBeNull();
  });
});
