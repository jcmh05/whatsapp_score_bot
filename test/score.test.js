const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const { applyScore } = require('../src/score');
const { scorePeriod } = require('../src/time');
const period = scorePeriod('2026-10-06T19:00:00+02:00');

const user = (fields = {}) => new User({ _id: '34123456789@c.us', scoreYear: 2026,
    monthlyScores: { enero: 30, octubre: 19 }, hours: {}, week: {}, ...fields });

test('un número sustituye el mes y recalcula el total sin inventar horas ni días', () => {
    const u = user();
    assert.equal(applyScore(u, '23', period).score, 23);
    assert.equal(u.totalScore, 53);
    assert.equal(u.monthlyScores.get('enero'), 30);
    assert.equal(u.hours.size, 0); assert.equal(u.week.size, 0);
});
test('+1 registra la hora y el día y felicita exactamente en el múltiplo de 50', () => {
    const u = user({ totalScore: 49 });
    assert.equal(applyScore(u, '+1', period).congratulations, true);
    assert.equal(u.totalScore, 50); assert.equal(u.lastCongratulated, 50);
    assert.equal(u.hours.get('h19'), 1); assert.equal(u.week.get('martes'), 1);
    assert.equal(applyScore(u, '20', period).congratulations, false);
    assert.equal(applyScore(u, '+1', period).congratulations, false);
});
test('-1 nunca crea contadores negativos y no cambia meses anteriores', () => {
    const u = user({ monthlyScores: { enero: 30, octubre: 1 } });
    applyScore(u, '-1', period);
    assert.equal(u.totalScore, 30); assert.equal(u.hours.get('h19'), 0);
    assert.equal(u.week.get('martes'), 0);
    assert.equal(applyScore(u, '-1', period).atZero, true);
    assert.equal(u.totalScore, 30);
});
test('un usuario nuevo recibe una única felicitación al registrar 100', () => {
    const u = user({ monthlyScores: {} });
    assert.equal(applyScore(u, '100', period, true).congratulations, true);
    assert.equal(u.lastCongratulated, 100);
    assert.equal(applyScore(u, '100', period).congratulations, false);
});
test('rechaza números que perderían precisión', () => {
    assert.throws(() => applyScore(user(), '99999999999999999999', period), /límite/);
});
test('el mes y el año cambian a medianoche de Madrid aunque el servidor use UTC', () => {
    assert.equal(scorePeriod('2026-12-31T22:59:00Z').year, 2026);
    const p = scorePeriod('2026-12-31T23:00:00Z');
    assert.equal(p.year, 2027); assert.equal(p.month, 'enero'); assert.equal(p.hourKey, 'h0');
});
