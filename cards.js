function renderWeekCards() {
  const box = document.querySelector('#weekPlanGrid');
  if (!box) return;
  const order = [
    { day: '周一', en: 'MON', key: 'mon', icon: '⇧', sub: '胸背基础' },
    { day: '周二', en: 'TUE', key: 'tue', icon: '▤', sub: '膝主导' },
    { day: '周三', en: 'WED', key: null, icon: '·', sub: '休息 / 恢复' },
    { day: '周四', en: 'THU', key: 'thu', icon: '⇧', sub: '肩背均衡' },
    { day: '周五', en: 'FRI', key: null, icon: '·', sub: '休息 / 恢复' },
    { day: '周六', en: 'SAT', key: 'sat', icon: '▤', sub: '髋主导' },
    { day: '周日', en: 'SUN', key: null, icon: '·', sub: '休息 / 恢复' }
  ];
  box.innerHTML = order.map((item, i) => {
    const workout = item.key ? days.find(x => x.key === item.key) : null;
    const selected = workout ? days.indexOf(workout) === activeDay : activeDay === -1 && item.day === '周三';
    const preview = workout
      ? workout.items.slice(0, 3).map(x => x[0]).join(' · ')
      : '散步、轻柔活动度，或完全休息';
    const focus = workout ? workout.focus : '给睡眠和肌肉恢复留出时间';
    return `<article class="week-card ${workout ? '' : 'rest'} ${selected ? 'selected' : ''}" data-week="${workout ? days.indexOf(workout) : -1}">
      <div class="week-card-top"><span class="week-card-day">${item.day} · ${item.en}</span><span class="week-card-icon">${item.icon}</span></div>
      <h4>${workout ? workout.name.split('·')[0].trim() : item.sub}</h4>
      <p>${focus}</p><div class="week-card-foot">${preview}${workout ? ' …' : ''}</div>
    </article>`;
  }).join('');
  box.querySelectorAll('[data-week]').forEach(card => card.onclick = () => {
    activeDay = Number(card.dataset.week);
    renderTraining();
    document.querySelector('#workoutPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
