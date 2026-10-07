// Local health log, portable data import, and optional standard BLE heart-rate reader.
function renderHealth() {
  const all = [...healthLogs].sort((a, b) => a.date.localeCompare(b.date));
  const recent = all.slice(-7);
  const mean = key => {
    const values = recent.map(x => x[key] == null || x[key] === '' ? null : Number(x[key])).filter(Number.isFinite);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const avgSleep = mean('sleep'), avgSteps = mean('steps');
  const avgWater = mean('water');
  const pulse = [...all].reverse().find(x => x.pulse != null);
  const waist = [...all].reverse().find(x => x.waist != null);
  $('#hAvgSleep').textContent = avgSleep == null ? '—' : avgSleep.toFixed(1);
  $('#hAvgSteps').textContent = avgSteps == null ? '—' : Math.round(avgSteps).toLocaleString();
  const waterMetric = $('#hAvgWater');
  if (waterMetric) waterMetric.textContent = avgWater == null ? '—' : avgWater.toFixed(1);
  $('#hLastPulse').textContent = pulse ? pulse.pulse : '—';
  $('#hLastWaist').textContent = waist ? Number(waist.waist).toFixed(1) : '—';

  const tbody = $('#healthTable tbody');
  tbody.innerHTML = '';
  $('#healthEmpty').hidden = all.length > 0;
  $('#healthTable').hidden = all.length === 0;
  all.slice(-30).reverse().forEach(x => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${x.date}</td><td>${x.sleep ?? '—'}</td><td>${x.pulse ?? '—'}</td><td>${x.sys && x.dia ? `${x.sys}/${x.dia}` : '—'}</td><td>${x.waist ?? '—'}</td><td>${x.steps ? Number(x.steps).toLocaleString() : '—'}</td><td>${x.temp ?? '—'}</td><td>${x.spo2 ?? '—'}</td><td>${x.glucose ?? '—'}</td><td>${x.water ?? '—'} / ${x.waterDay ?? '—'} / ${x.waterWorkout ?? '—'}</td><td>${x.stress ?? '—'} / ${x.energy ?? '—'} / ${x.soreness ?? '—'}</td><td><button class="linkbtn" data-hdel="${x.date}">删除</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-hdel]').forEach(btn => btn.onclick = () => {
    healthLogs = healthLogs.filter(x => x.date !== btn.dataset.hdel);
    store.set('health', healthLogs); renderHealth();
  });

  const notes = [];
  if (avgSleep != null && avgSleep < 6.5) notes.push('近 7 条记录的平均睡眠偏短：优先恢复，训练不加量，并持续关注睡眠困难。');
  if (recent.filter(x => Number(x.stress) >= 4).length >= 3) notes.push('近期压力评分偏高：考虑轻量训练或休息，并安排合适的压力支持。');
  if (recent.filter(x => Number(x.soreness) >= 4).length >= 3) notes.push('酸痛 / 疲劳记录持续偏高：减少训练量；若有疼痛或不适，请就医评估。');
  const last = all.at(-1);
  if (last?.sys && last?.dia) notes.push(`最近血压记录为 ${last.sys}/${last.dia} mmHg。单次读数不能用于诊断；如反复异常或担心，请复测并咨询医生。`);
  if (!notes.length) notes.push('继续在相似条件下记录，观察个人趋势；单日数字不代表诊断。');
  $('#healthAdvice').innerHTML = `<small>根据已记录的近况</small><b>${notes[0]}</b><p>${notes.slice(1).join('<br>')}</p>`;
}

$('#hDate').value = new Date().toISOString().slice(0, 10);
$('#healthForm').onsubmit = e => {
  e.preventDefault();
  const num = id => $('#'+id).value === '' ? null : Number($('#'+id).value);
  const entry = {
    date: $('#hDate').value, sleep: num('hSleep'), pulse: num('hPulse'), sys: num('hSys'), dia: num('hDia'),
    waist: num('hWaist'), steps: num('hSteps'), water: num('hWater'), waterDay: num('hWaterDay'), waterWorkout: num('hWaterWorkout'), temp: num('hTemp'),
    spo2: num('hSpo2'), glucose: num('hGlucose'), protein: num('hProtein'), calories: num('hCalories'),
    stress: num('hStress'), energy: num('hEnergy'), soreness: num('hSoreness'), workout: $('#hWorkout').value,
    notes: $('#hNotes').value.slice(0, 300)
  };
  healthLogs = healthLogs.filter(x => x.date !== entry.date);
  healthLogs.push(entry); healthLogs.sort((a, b) => a.date.localeCompare(b.date));
  store.set('health', healthLogs); renderHealth(); toast('健康日志已保存');
};

// Apple Health export.xml can be selected after extracting export.zip.
// Generic CSV headers: date,sleep,pulse,sys,dia,weight,steps,waist,water,water_day,water_workout.
async function importHealthFile(file) {
  const status = $('#importStatus');
  if (!file) return;
  try {
    const text = await file.text();
    let rows = [];
    if (file.name.toLowerCase().endsWith('.json')) {
      const data = JSON.parse(text); rows = Array.isArray(data) ? data : (data.records || data.data || []);
    } else if (file.name.toLowerCase().endsWith('.xml')) {
      const xml = new DOMParser().parseFromString(text, 'application/xml');
      if (xml.querySelector('parsererror')) throw new Error('XML 无法解析');
      const map = {};
      xml.querySelectorAll('Record').forEach(r => {
        const type = r.getAttribute('type') || '', date = (r.getAttribute('startDate') || '').slice(0, 10);
        const value = Number(r.getAttribute('value')), unit = (r.getAttribute('unit') || '').toLowerCase();
        if (!date) return;
        const x = map[date] || (map[date] = { date });
        if (type.includes('BodyMass') && Number.isFinite(value)) x.weight = unit.includes('lb') ? value * 0.453592 : value;
        if (type.includes('HeartRate') && Number.isFinite(value)) { x.pulseSum = (x.pulseSum || 0) + value; x.pulseN = (x.pulseN || 0) + 1; }
        if (type.includes('StepCount') && Number.isFinite(value)) x.steps = (x.steps || 0) + value;
        if (type.includes('BloodPressureSystolic') && Number.isFinite(value)) x.sys = value;
        if (type.includes('BloodPressureDiastolic') && Number.isFinite(value)) x.dia = value;
        if (type.includes('WaistCircumference') && Number.isFinite(value)) x.waist = unit === 'm' ? value * 100 : value;
        if (type.includes('SleepAnalysis') && !(r.getAttribute('value') || '').toLowerCase().includes('awake')) {
          const duration = (new Date(r.getAttribute('endDate')) - new Date(r.getAttribute('startDate'))) / 3600000;
          if (duration > 0 && duration < 24) x.sleep = (x.sleep || 0) + duration;
        }
      });
      rows = Object.values(map).map(x => ({ ...x, pulse: x.pulseN ? Math.round(x.pulseSum / x.pulseN) : null }));
    } else {
      const lines = text.trim().split(/\r?\n/), headers = lines.shift().split(',').map(x => x.trim().toLowerCase());
      rows = lines.map(line => {
        const cells = line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g) || [];
        const values = cells.map(x => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
        return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
      });
    }
    let count = 0;
    rows.forEach(row => {
      const date = String(row.date || row.startDate || row.day || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const entry = healthLogs.find(x => x.date === date) || { date };
      const fields = { sleep:['sleep','sleephours'], pulse:['pulse','heart_rate','heartrate'], sys:['sys','systolic'], dia:['dia','diastolic'], waist:['waist','waist_cm'], steps:['steps','step_count'], water:['water','water_liters'], waterDay:['water_day','waterday'], waterWorkout:['water_workout','waterworkout'], temp:['temp','temperature'], spo2:['spo2','oxygen_saturation'], glucose:['glucose','blood_glucose'], protein:['protein','protein_g'], calories:['calories','energy_kcal'], stress:['stress'], energy:['energy'], soreness:['soreness'] };
      Object.entries(fields).forEach(([key, aliases]) => { const k = aliases.find(a => row[a] !== undefined && row[a] !== '' && Number.isFinite(Number(row[a]))); if (k) entry[key] = Number(row[k]); });
      const wk = ['weight','body_mass'].find(k => row[k] !== undefined && Number.isFinite(Number(row[k])));
      if (wk) { entry.weight = Number(row[wk]); weights = weights.filter(x => x.date !== date); weights.push({ date, kg: entry.weight }); }
      if (row.pulseSum && row.pulseN) entry.pulse = Math.round(row.pulseSum / row.pulseN);
      healthLogs = healthLogs.filter(x => x.date !== date); healthLogs.push(entry); count++;
    });
    healthLogs.sort((a, b) => a.date.localeCompare(b.date)); weights.sort((a, b) => a.date.localeCompare(b.date));
    store.set('health', healthLogs); store.set('weights', weights);
    if (weights.length) $('#heroWeight').textContent = weights.at(-1).kg.toFixed(1);
    renderHealth(); renderTrack(); status.textContent = `已在本机导入 ${count} 天`; toast('健康数据已导入');
  } catch (err) { status.textContent = '导入失败：请检查文件格式和表头'; console.error(err); }
}
$('#healthImport').onchange = e => importHealthFile(e.target.files[0]);

// Optional real-time BLE heart rate. Requires a compatible HR broadcast device,
// a supported browser, and a secure origin (HTTPS or localhost).
$('#bleConnect').onclick = async () => {
  const status = $('#importStatus');
  try {
    if (!navigator.bluetooth) throw new Error('此浏览器不支持 Web Bluetooth；请用兼容 Chrome / Edge，并通过 HTTPS 或 localhost 打开。');
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    const server = await device.gatt.connect(), service = await server.getPrimaryService('heart_rate');
    const characteristic = await service.getCharacteristic('heart_rate_measurement');
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', event => {
      const data = event.target.value, flags = data.getUint8(0), bpm = flags & 1 ? data.getUint16(1, true) : data.getUint8(1);
      $('#hPulse').value = bpm; status.textContent = `${device.name || '设备'} · 当前 ${bpm} 次/分；保存打卡后写入日志`;
    });
    status.textContent = `已连接 ${device.name || '设备'}，等待心率数据`;
  } catch (err) { status.textContent = err.message || '连接未完成；确认设备支持标准蓝牙心率服务且正在广播。'; }
};
renderHealth();
