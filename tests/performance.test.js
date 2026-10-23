import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameLoop, AdaptiveQuality, QUALITY_PROFILES, selectQuality } from '../src/performance.js';

function scheduler(frame) {
  const queued = new Map();
  let sequence = 0;
  const loop = new FrameLoop(frame, { request: fn => { queued.set(++sequence, fn); return sequence; }, cancel: id => queued.delete(id) });
  const step = now => { const [id, fn] = queued.entries().next().value; queued.delete(id); fn(now); };
  return { loop, queued, step };
}

test('暂停空闲不保留调度，唤醒不补算空闲时间', () => {
  const deltas = [];
  const { loop, queued, step } = scheduler((now, delta) => { deltas.push(delta); return false; });
  loop.wake(); loop.wake();
  assert.equal(queued.size, 1);
  step(10);
  assert.equal(queued.size, 0);
  loop.wake(); step(10000);
  assert.deepEqual(deltas, [0, 0]);
});

test('后台取消 RAF，恢复首帧 delta 为零，销毁后不能再唤醒', () => {
  const deltas = [];
  const { loop, queued, step } = scheduler((now, delta) => { deltas.push(delta); return true; });
  loop.wake(); step(10); step(30);
  loop.setVisible(false);
  assert.equal(queued.size, 0);
  loop.wake(); assert.equal(queued.size, 0);
  loop.setVisible(true); step(10000);
  assert.equal(deltas.at(-1), 0);
  loop.dispose(); loop.wake(); assert.equal(queued.size, 0);
});

test('30帧档调度限速而计时不丢失', () => {
  const deltas = [];
  const { loop, step } = scheduler((now, delta) => { deltas.push(delta); return true; });
  loop.setTargetFps(30);
  loop.wake(); step(0); step(16.7); step(33.4);
  assert.deepEqual(deltas, [0, 0.0334]);
});

test('60帧档在高刷屏上也限制最高渲染频率', () => {
  const deltas = [];
  const { loop, step } = scheduler((now, delta) => { deltas.push(delta); return true; });
  loop.setTargetFps(60);
  loop.wake();
  step(0);
  step(8.3);
  step(16.7);
  step(25);
  step(33.4);
  assert.equal(deltas.length, 3);
  assert.ok(Math.abs(deltas[1] - 0.0167) < 0.001);
  assert.ok(Math.abs(deltas[2] - 0.0167) < 0.001);
});

test('自由预览连续输入在144Hz屏幕上仍按60帧预算调度', () => {
  let renders = 0;
  const { loop, step } = scheduler(() => { renders += 1; return true; });
  loop.setTargetFps(60);
  loop.wake();
  for (let frame = 0; frame <= 144; frame += 1) step(frame * 1000 / 144);
  assert.ok(renders >= 59 && renders <= 61, `实际渲染 ${renders} 次`);
});

test('自由预览连续输入在120Hz屏幕上仍按30帧预算调度', () => {
  let renders = 0;
  const { loop, step } = scheduler(() => { renders += 1; return true; });
  loop.setTargetFps(30);
  loop.wake();
  for (let frame = 0; frame <= 120; frame += 1) step(frame * 1000 / 120);
  assert.ok(renders >= 30 && renders <= 31, `实际渲染 ${renders} 次`);
});

test('画质档位分别限制电脑与手机最高帧率', () => {
  assert.equal(QUALITY_PROFILES.high.fps, 60);
  assert.equal(QUALITY_PROFILES.balanced.fps, 60);
  assert.equal(QUALITY_PROFILES.mobile.fps, 30);
  assert.equal(QUALITY_PROFILES.low.fps, 30);
});

test('高画质保留高分辨率阴影和倒影，但降低更新频率', () => {
  assert.equal(QUALITY_PROFILES.high.shadowHz, 30);
  assert.equal(QUALITY_PROFILES.high.reflectionHz, 30);
  assert.ok(QUALITY_PROFILES.high.shadowSize > QUALITY_PROFILES.balanced.shadowSize);
  assert.ok(QUALITY_PROFILES.high.reflectionSize > QUALITY_PROFILES.balanced.reflectionSize);
});

test('设备选档和显式画质固定', () => {
  assert.equal(selectQuality({ width: 1440 }).name, 'high');
  assert.equal(selectQuality({ width: 390 }).name, 'mobile');
  assert.equal(selectQuality({ width: 1024, coarsePointer: true }).name, 'mobile');
  assert.equal(selectQuality({ width: 390, override: 'high' }).name, 'high');
});

test('连续慢帧降档，短暂波动不降档，锁定档不改变', () => {
  const changes = [];
  const adaptive = new AdaptiveQuality(QUALITY_PROFILES.high, { onChange: profile => changes.push(profile.name) });
  for (let i=0;i<160;i++) adaptive.sample(25);
  assert.deepEqual(changes, []);
  for (let i=0;i<100;i++) adaptive.sample(25);
  assert.deepEqual(changes, ['balanced']);
  const locked = new AdaptiveQuality(QUALITY_PROFILES.high, { locked: true, onChange: () => assert.fail() });
  for (let i=0;i<1000;i++) locked.sample(50);
});
