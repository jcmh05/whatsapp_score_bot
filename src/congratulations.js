const User = require('../models/User');

async function generateRandomCongratsExtra(user) {
  const randomEmojis = ['🚬','📴','🇵🇪','🕵️‍♂️','🛋','❗','🦩','🧠','🪀','🥏','🌯','🍄','🪳','🔪','🗣️','🫛','🥜','🧑‍🦼','🦿'];
  const events = ['emoji', 'bestDay', 'worstDay', 'rival'];
  const choice = events[Math.floor(Math.random() * events.length)];

  if (choice === 'emoji') {
    return ` ${randomEmojis[Math.floor(Math.random() * randomEmojis.length)]}`;
  }

  const weekMap = user.week || new Map();
  const days = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
  const total = days.reduce((sum, d) => sum + (weekMap.get(d) || 0), 0);

  if (choice === 'bestDay') {
    let best = days[0], cnt = weekMap.get(best) || 0;
    days.forEach(d => {
      const c = weekMap.get(d) || 0;
      if (c > cnt) { cnt = c; best = d; }
    });
    const avgOther = ((total - cnt) / (days.length - 1)) || 0;
    const pct = avgOther > 0 ? Math.round(((cnt - avgOther) / avgOther) * 100) : 0;
    const dayCap = best.charAt(0).toUpperCase() + best.slice(1);
    return ` El ${dayCap} es el día que más puntos sueles sumar, sumando un ${pct}% más que el resto.`;
  }

  if (choice === 'worstDay') {
    let worst = days[0], cnt = weekMap.get(worst) || 0;
    days.forEach(d => {
      const c = weekMap.get(d) || 0;
      if (c < cnt) { cnt = c; worst = d; }
    });
    const avgOther = ((total - cnt) / (days.length - 1)) || 0;
    const pct = avgOther > 0 ? Math.round(((avgOther - cnt) / avgOther) * 100) : 0;
    const dayCap = worst.charAt(0).toUpperCase() + worst.slice(1);
    return ` El ${dayCap} es el día que menos puntos sueles sumar, sumando un ${pct}% menos que el resto.`;
  }

  // rival
  const others = await User.find({ _id: { $ne: user._id } });
  if (!others.length) return '';
  let closest = null, diff = Infinity;
  others.forEach(o => {
    const d = Math.abs(user.totalScore - o.totalScore);
    if (d < diff) { diff = d; closest = o; }
  });
  if (!closest) return '';
  const rivalName = (closest.displayName && closest.displayName !== 'Usuario')
    ? closest.displayName
    : closest._id;
  const relation = user.totalScore >= closest.totalScore ? 'por encima' : 'por debajo';
  return ` Tu rival más cercano es ${rivalName} con quien estás a ${diff} puntos de distancia ${relation}.`;
}

module.exports = { generateRandomCongratsExtra };
