// Optional authenticated cross-device sync for the LEANFORM static site.
// Safe default: if project config is blank, everything remains local-only.
(() => {
  const config = window.LEANFORM_SUPABASE || {};
  const panel = document.querySelector('#cloudSyncPanel');
  const status = document.querySelector('#cloudSyncStatus');
  if (!panel || !status || !config.url || !config.anonKey || !config.ownerId || !window.supabase) {
    if (status) status.textContent = '云端尚未配置；当前记录只保存在此浏览器。';
    document.querySelectorAll('.cloud-auth-controls').forEach(el => el.hidden = true);
    return;
  }

  const client = window.supabase.createClient(config.url, config.anonKey);
  const keys = ['weights', 'loads_v2', 'done_v2', 'health'];
  const originalSet = store.set.bind(store);
  let user = null, role = 'offline', applyingRemote = false, channel = null;
  const say = text => { status.textContent = text; };
  const encode = value => JSON.parse(JSON.stringify(value));

  function setRole(next) {
    role = next;
    document.documentElement.dataset.syncRole = next;
    document.querySelector('#localUploadButton').hidden = next !== 'owner';
    document.querySelector('#cloudSignOut').hidden = !user;
  }

  function applyRecord(key, value) {
    applyingRemote = true;
    originalSet(key, value);
    if (key === 'weights') weights = value;
    if (key === 'loads_v2') loads = value;
    if (key === 'done_v2') done = value;
    if (key === 'health') healthLogs = value;
    applyingRemote = false;
  }

  async function saveCloud(key, value) {
    if (!user || user.id !== config.ownerId || role !== 'owner' || applyingRemote || !keys.includes(key)) return;
    const { error } = await client.from('leanform_records').upsert({
      owner_id: user.id, data_key: key, value: encode(value), updated_at: new Date().toISOString()
    }, { onConflict: 'owner_id,data_key' });
    if (error) say(`同步失败：${error.message}`);
    else say('已连接 · 数据自动同步');
  }

  store.set = (key, value) => {
    originalSet(key, value);
    void saveCloud(key, value);
  };

  function refreshViews() {
    if (typeof renderTraining === 'function') renderTraining();
    if (typeof renderTrack === 'function') renderTrack();
    if (typeof renderHealth === 'function') renderHealth();
    if (typeof drawChart === 'function') {
      drawChart(document.querySelector('#miniChart'), weights.slice(-14));
      drawChart(document.querySelector('#weightChart'), weights.slice(-30));
    }
    const hero = document.querySelector('#heroWeight');
    if (hero) hero.textContent = (weights.at(-1)?.kg ?? 57).toFixed(1);
  }

  async function startSession(current) {
    user = current;
    const isOwner = !!user && user.id === config.ownerId;
    setRole(isOwner ? 'owner' : 'viewer');
    document.querySelector('#cloudUserEmail').textContent = isOwner ? (user.email || '所有者') : '公开只读访问';

    const { data: rows, error } = await client.from('leanform_records').select('owner_id,data_key,value,updated_at');
    if (error) { say(`读取云端记录失败：${error.message}`); return; }
    const selected = (rows || []).filter(row => row.owner_id === config.ownerId);
    if (selected.length) {
      selected.forEach(row => applyRecord(row.data_key, row.value));
      refreshViews();
      say(isOwner ? '已连接 · 公开数据实时同步' : '已连接 · 公开只读，正在接收实时更新');
    } else if (isOwner) {
      say('已登录 · 上传本机记录后，任何访问者都能实时查看');
    } else {
      say('公开同步尚无记录；当前浏览器的本地记录仅本机可见');
    }

    if (channel) await client.removeChannel(channel);
    channel = client.channel('leanform:public').on('postgres_changes', {
      event: '*', schema: 'public', table: 'leanform_records'
    }, event => {
      const row = event.new?.owner_id ? event.new : event.old;
      if (!row || row.owner_id !== config.ownerId) return;
      const key = row.data_key;
      if (!keys.includes(key)) return;
      if (event.eventType === 'DELETE') applyRecord(key, key === 'weights' || key === 'health' ? [] : {});
      else applyRecord(key, row.value);
      refreshViews();
      say('已连接 · 收到实时更新');
    }).subscribe();
  }

  document.querySelector('#cloudSendCode').onclick = async () => {
    const email = document.querySelector('#cloudEmail').value.trim().toLowerCase();
    if (!email) return say('请输入登录邮箱');
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
    say(error ? `发送失败：${error.message}` : '登录链接/验证码已发送到邮箱');
  };
  document.querySelector('#cloudVerifyCode').onclick = async () => {
    const email = document.querySelector('#cloudEmail').value.trim().toLowerCase();
    const token = document.querySelector('#cloudOtp').value.trim();
    const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) say(`验证失败：${error.message}`); else await startSession(data.user);
  };
  document.querySelector('#cloudSignOut').onclick = async () => { await client.auth.signOut(); user = null; setRole('offline'); say('已退出登录'); };
  document.querySelector('#localUploadButton').onclick = async () => {
    if (!user || user.id !== config.ownerId || role !== 'owner') return;
    if (!confirm('这会把当前浏览器保存的全部健康记录（含睡眠、压力、身体指标和备注）上传到公开网站。任何访问网站的人都可以查看。确定上传吗？')) return;
    for (const key of keys) await saveCloud(key, store.get(key, key === 'weights' || key === 'health' ? [] : {}));
    say('本机记录已上传；所有访问者都可实时查看');
  };

  document.addEventListener('submit', event => {
    if (role === 'viewer' && event.target.matches('#weightForm,#healthForm')) {
      event.preventDefault(); event.stopImmediatePropagation(); say('家庭共享账号只有查看权限');
    }
  }, true);
  document.addEventListener('click', event => {
    if (role === 'viewer' && event.target.closest('[data-load],[data-done],[data-del],[data-hdel],#healthImport,#bleConnect')) {
      event.preventDefault(); event.stopImmediatePropagation(); say('家庭共享账号只有查看权限');
    }
  }, true);

  client.auth.onAuthStateChange((_event, session) => { void startSession(session?.user || null); });
  client.auth.getSession().then(({ data }) => startSession(data.session?.user || null));
})();
