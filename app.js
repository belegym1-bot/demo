import { renderView, bindView, parseViewForm } from './views.js';

const icons = {
  feed: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 10h18m-11 0v11"/>',
  groups: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m19 0v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/><circle cx="9.5" cy="7" r="4"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  profile: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 21v-1.5A4.5 4.5 0 0 1 9 15h6a4.5 4.5 0 0 1 4.5 4.5V21"/>',
  logout: '<path d="M10 17l5-5-5-5m5 5H3m11-9h6a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  heart: '<path d="M20.8 8.8c0 4.4-8.8 9.9-8.8 9.9S3.2 13.2 3.2 8.8a4.4 4.4 0 0 1 8.8-.7 4.4 4.4 0 0 1 8.8.7Z"/>',
  comment: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.9-.9L3 21l1.9-5.6a9 9 0 0 1-.9-3.9 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 8 8z"/>',
  camera: '<path d="M8 6l1.4-2h5.2L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  workout: '<path d="M6 7H4v10h2m12-10h2v10h-2M2 10v4m20-4v4M6 5h4v14H6zm8 0h4v14h-4zm-4 7h4"/>',
  shield: '<path d="M12 22s7-3.5 7-10V6l-7-3-7 3v6c0 6.5 7 10 7 10Z"/><path d="m9.5 12 1.8 1.8 3.6-3.7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v3"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
};

const root = document.querySelector('#app');
const notice = document.querySelector('#notice');
const absoluteDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' });
const relativeDate = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
let state = { user: null, users: [], groups: [], posts: [], reports: [] };
let groupFilter = '';
let visiblePosts = 8;
let busy = false;
let noticeTimer;
let currentAuthPage = 'login';
let previouslyShownUser;
let routeVersion = 0;

function icon(name, size = 20) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
}

function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function imageUrl(value) {
  const candidate = String(value || '');
  return /^(?:\/(?:assets|api)\/|data:image\/(?:jpeg|png|webp);base64,)/.test(candidate) ? esc(candidate) : '';
}

function initials(name) {
  return String(name || 'Aluno').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function avatar(person, style = '') {
  const url = imageUrl(person?.avatar);
  return `<span class="avatar ${style}" aria-hidden="true">${url ? `<img src="${url}" alt="" loading="lazy" decoding="async">` : esc(initials(person?.name))}</span>`;
}

function logo() {
  return '<img class="wordmark" src="/assets/logo.png" alt="Belê GYM">';
}

function getRoute() {
  const [page = 'feed', id] = location.hash.slice(1).split('/');
  return { page: page || 'feed', id };
}

function navigate(page) {
  if (location.hash === `#${page}`) render();
  else location.hash = page;
}

function memberGroups() {
  return state.groups.filter((group) => !group.archived && group.members.some((member) => member.userId === state.user?.id));
}

function person(id) {
  return state.users.find((user) => user.id === id) || { name: 'Aluno da academia' };
}

function dateLabel(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (!Number.isFinite(minutes) || minutes < 1) return 'Agora';
  if (minutes < 60) return relativeDate.format(-minutes, 'minute');
  if (minutes < 1440) return relativeDate.format(-Math.floor(minutes / 60), 'hour');
  return relativeDate.format(-Math.floor(minutes / 1440), 'day');
}

function dateTime(timestamp) {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? absoluteDate.format(date) : '';
}

function navLink(page, text, symbol, active) {
  const selected = active === page || (page === 'groups' && active === 'group');
  return `<a class="nav-link${selected ? ' active' : ''}" href="#${page}"${selected ? ' aria-current="page"' : ''}>${icon(symbol)}<span>${text}</span></a>`;
}

function authForm() {
  if (currentAuthPage === 'activate' || currentAuthPage === 'reset') {
    const activating = currentAuthPage === 'activate';
    return `<form class="auth-form" data-form="${currentAuthPage}">
      <h1>${activating ? 'Ative sua conta' : 'Defina uma nova senha'}</h1>
      <p>Use o e-mail cadastrado e o código ${activating ? 'que a academia forneceu' : 'da recuperação'}.</p>
      <label>E-mail<input type="email" name="email" autocomplete="email" required></label>
      <label>Código<input name="code" autocomplete="one-time-code" required></label>
      <label>Nova senha<input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn btn-primary" type="submit">${activating ? 'Ativar conta' : 'Salvar nova senha'}</button>
      <button class="btn btn-text" type="button" data-action="auth-page" data-page="login">Voltar ao início</button>
    </form>`;
  }
  if (currentAuthPage === 'recover') {
    return `<form class="auth-form" data-form="recover">
      <h1>Recupere sua senha</h1><p>Informe o e-mail que a academia tem no seu cadastro.</p>
      <label>E-mail<input type="email" name="email" autocomplete="email" required></label>
      <button class="btn btn-primary" type="submit">Solicitar recuperação</button>
      <button class="btn btn-text" type="button" data-action="auth-page" data-page="login">Voltar ao início</button>
    </form>`;
  }
  return `<form class="auth-form" data-form="login">
    <h1>Acesse sua conta.</h1><p>Entre com o e-mail cadastrado na academia.</p>
    <label>E-mail<input type="email" name="email" autocomplete="email" placeholder="seu@email.com" required></label>
    <label>Senha<input type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn btn-primary" type="submit">Entrar</button>
    <div class="auth-links">
      <button class="btn btn-text" type="button" data-action="auth-page" data-page="activate">Ativar conta</button>
      <button class="btn btn-text" type="button" data-action="auth-page" data-page="recover">Esqueci a senha</button>
    </div>
  </form>
  <section class="demo-entries" aria-label="Contas de demonstração">
    <h2>Experimente o MVP local</h2>
    <p>As contas de demonstração usam dados fictícios.</p>
    <div class="demo-actions">
      <button type="button" class="btn btn-secondary" data-action="demo" data-role="student">${icon('profile',17)} Entrar como aluna</button>
      <button type="button" class="btn btn-secondary" data-action="demo" data-role="admin">${icon('shield',17)} Painel da academia</button>
    </div>
  </section>`;
}

function renderAuth() {
  return `<main class="auth-layout">
    <section class="auth-side">
      <header><a href="#login">${logo()}</a></header>
      <div class="auth-content">${authForm()}</div>
      <footer>${icon('lock', 15)} Acesso reservado a alunos cadastrados.</footer>
    </section>
    <div class="auth-hero">
      <div class="auth-hero-image"></div>
      <div class="auth-hero-copy">
        <p>Seu grupo. Seu ritmo.</p>
        <h2>Cada treino<br>conta.</h2>
      </div>
    </div>
  </main>`;
}

function shell(route, content) {
  const user = state.user;
  const admin = user.role === 'admin';
  const active = route.page;
  const title = admin ? 'Painel da academia' : 'Área do aluno';
  return `<div class="layout">
    <a class="skip-link" href="#main-content">Pular para o conteúdo</a>
    <aside class="side">
      <a class="side-brand" href="#${admin ? 'students' : 'feed'}">${logo()}</a>
      <nav class="side-nav" aria-label="Navegação principal">
        ${admin ? `${navLink('students', 'Alunos', 'groups', active)}${navLink('reports', 'Denúncias', 'shield', active)}` : `
          ${navLink('feed', 'Feed', 'feed', active)}
          ${navLink('groups', 'Meus grupos', 'groups', active)}
          ${navLink('history', 'Meu histórico', 'history', active)}
          ${navLink('profile', 'Meu perfil', 'profile', active)}`}
      </nav>
      <div class="side-bottom">
        <button type="button" class="nav-link side-exit" data-action="logout">${icon('logout')} Sair da conta</button>
        <div class="side-session">${avatar(user, 'avatar-dark')}<div><strong>${esc(user.name)}</strong><span>${admin ? 'Academia' : 'Conta de aluno'}</span></div></div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span class="area-label">${icon(admin ? 'shield' : 'feed',18)}${title}</span>
        <a class="mobile-brand" href="#${admin ? 'students' : 'feed'}">${logo()}</a>
        <div class="top-actions">
          <a class="top-profile" href="#profile" aria-label="Meu perfil">${avatar(user)}</a>
        </div>
      </header>
      <main class="main" id="main-content" tabindex="-1">${content}</main>
    </div>
    ${admin ? `<nav class="bottom-nav" aria-label="Navegação principal">${navLink('students','Alunos','groups',active)}${navLink('reports','Denúncias','shield',active)}${navLink('profile','Perfil','profile',active)}</nav>` : `
    <nav class="bottom-nav" aria-label="Navegação principal">${navLink('feed','Feed','feed',active)}${navLink('compose','Check-in','plus',active)}${navLink('groups','Grupos','groups',active)}</nav>`}
  </div>`;
}

function groupList(groups) {
  return `<section class="rail-card">
    <div class="rail-heading"><h2>Meus grupos</h2>${icon('groups',20)}</div>
    ${groups.length ? `<ul class="rail-groups">${groups.slice(0, 4).map((group, i) => `<li><a href="#group/${esc(group.id)}"><span class="group-icon tone-${i % 3}">${icon(['groups','workout','heart'][i % 3],19)}</span><span><strong>${esc(group.name)}</strong><small>${group.members.length} ${group.members.length === 1 ? 'membro' : 'membros'}</small></span><span class="group-next">${icon('chevron',16)}</span></a></li>`).join('')}</ul>`
      : '<p class="muted">Entre em um grupo para acompanhar seus amigos.</p>'}
    <a href="#groups" class="btn btn-secondary rail-button">Ver meus grupos ${icon('chevron',16)}</a>
  </section>`;
}

function workoutSummary(workout) {
  if (!workout.length) return '';
  const strength = workout.filter((exercise) => exercise.type === 'forca');
  const cardio = workout.filter((exercise) => exercise.type === 'cardio');
  return [strength.length ? `${strength.length} ${strength.length === 1 ? 'exercício de força' : 'exercícios de força'}` : '',
    cardio.length ? `${cardio.reduce((total, exercise) => total + Number(exercise.minutes || 0), 0)} min de cardio` : ''].filter(Boolean).join(' · ');
}

function postMenu(post) {
  const mine = post.authorId === state.user.id;
  const groups = state.groups.filter((group) => post.groupIds.includes(group.id) &&
    group.members.some((member) => member.userId === state.user.id && ['owner','admin'].includes(member.role)));
  const canReport = !mine && state.user.role === 'student' && post.groupIds.length;
  if (!mine && !canReport && !groups.length) return '';
  return `<details class="post-menu"><summary aria-label="Opções do check-in">${icon('dots')}</summary><div>
    ${mine && post.editable ? `<a href="#compose/${esc(post.id)}">Editar check-in</a>` : ''}
    ${canReport ? `<button type="button" data-action="report-dialog" data-id="${esc(post.id)}">Denunciar check-in</button>` : ''}
    ${groups.map((group) => `<button type="button" data-action="post.removeGroup" data-id="${esc(post.id)}" data-group-id="${esc(group.id)}">Retirar de ${esc(group.name)}</button>`).join('')}
    ${mine ? `<button class="danger" type="button" data-action="post.delete" data-id="${esc(post.id)}">Excluir check-in</button>` : ''}
  </div></details>`;
}

function renderPost(post, detail = false) {
  const author = person(post.authorId);
  const names = post.groupIds.map((id) => state.groups.find((group) => group.id === id)?.name).filter(Boolean);
  const photo = imageUrl(post.photo);
  const summary = workoutSummary(post.workout);
  return `<article class="post-card" aria-label="Check-in de ${esc(author.name)}">
    <header class="post-top">
      <div class="post-author">${avatar(author, author.name === 'Júlia Alves' ? 'avatar-lilac' : 'avatar-mint')}
        <div><strong>${esc(author.name)}</strong><p><time datetime="${esc(post.createdAt)}" title="${esc(dateTime(post.createdAt))}">${esc(dateLabel(post.createdAt))}</time>${names.length ? `<span> · </span>${esc(names.join(' · '))}` : '<span> · </span>Histórico pessoal'}</p></div>
      </div>
      ${postMenu(post)}
    </header>
    ${photo ? `<a class="post-photo" href="#post/${esc(post.id)}" aria-label="Ver check-in de ${esc(author.name)}"><img src="${photo}" alt="Foto do check-in de ${esc(author.name)}" loading="lazy" decoding="async"></a>` : ''}
    ${post.hidden ? '<p class="post-hidden">Este registro de treino foi preservado no histórico.</p>' : ''}
    ${summary ? `<div class="post-workout">${icon('workout',19)}<span><strong>Treino registrado</strong><small>${esc(summary)}</small></span>${detail ? '' : `<a href="#post/${esc(post.id)}" aria-label="Ver treino">${icon('chevron',18)}</a>`}</div>` : ''}
    ${!post.hidden && names.length ? `<div class="post-actions">
      <button type="button" class="icon-label${post.liked ? ' liked' : ''}" data-action="post.like" data-id="${esc(post.id)}" data-liked="${!post.liked}" aria-pressed="${post.liked}" aria-label="${post.liked ? 'Descurtir' : 'Curtir'} este check-in">${icon('heart',21)} <span>${post.likes}</span></button>
      ${detail && post.authorId === state.user.id && post.likedBy?.length ? `<small title="${esc(post.likedBy.map((id) => person(id).name).join(', '))}">${esc(post.likedBy.map((id) => person(id).name).join(', '))}</small>` : ''}
      <a class="icon-label" href="#post/${esc(post.id)}" aria-label="Ver comentários">${icon('comment',20)}<span>${post.comments.length}</span></a>
      ${detail ? '' : `<a class="post-detail-link" href="#post/${esc(post.id)}">Ver check-in ${icon('chevron',15)}</a>`}
    </div>` : ''}
  </article>`;
}

function feed() {
  const groups = memberGroups();
  if (groupFilter && !groups.some((group) => group.id === groupFilter)) groupFilter = '';
  const posts = state.posts.filter((post) => !post.hidden && post.groupIds.length && (!groupFilter || post.groupIds.includes(groupFilter)));
  const first = state.user.name.trim().split(/\s+/)[0];
  return `<div class="feed-page">
    <header class="greeting"><h1>Olá, ${esc(first)}!</h1><p>Acompanhe os treinos do seu grupo e mantenha o ritmo.</p></header>
    <div class="feed-grid">
      <div class="feed-column">
        <section class="hero">
          <div class="hero-copy">
            <h2>Cada treino<br><em>conta.</em></h2>
            <p>Mais fácil manter o ritmo quando a turma treina junto.</p>
            <a href="#compose" class="btn btn-primary mobile-only">${icon('plus',18)} Novo check-in</a>
            <a href="#history" class="btn btn-primary desktop-only">${icon('history',18)} Meu histórico</a>
          </div>
          <div class="hero-art" aria-hidden="true"><span></span><span></span><span></span><img src="/assets/mark-turquoise.png" alt=""></div>
        </section>
        <section class="feed-section" aria-labelledby="feed-title">
          <div class="section-heading">
            <h2 id="feed-title">Check-ins recentes</h2>
            <label class="filter"><span class="sr-only">Filtrar por grupo</span>${icon('groups',16)}<select id="group-filter"><option value="">Todos os grupos</option>${groups.map((group) => `<option value="${esc(group.id)}"${groupFilter === group.id ? ' selected' : ''}>${esc(group.name)}</option>`).join('')}</select>${icon('down',15)}</label>
          </div>
          ${posts.length ? `<div class="post-list">${posts.slice(0, visiblePosts).map((post) => renderPost(post)).join('')}</div>` : `<div class="empty-card"><span>${icon(groups.length ? 'camera' : 'groups',24)}</span><h3>${groups.length ? 'Ainda não há check-ins por aqui' : 'Falta só a sua turma'}</h3><p>${groups.length ? 'Os registros deste grupo aparecem aqui assim que alguém compartilhar.' : 'Entre em um grupo para acompanhar os check-ins dos seus amigos.'}</p>${groups.length ? '' : '<a href="#groups" class="btn btn-primary">Explorar meus grupos</a>'}</div>`}
          ${posts.length > visiblePosts ? '<button type="button" class="btn btn-secondary load-more" data-action="load-more">Mostrar mais check-ins</button>' : ''}
        </section>
      </div>
      <aside class="feed-rail" aria-label="Seus grupos e atalhos">
        ${groupList(groups)}
        <section class="rail-card camera-card">
          <span class="camera-icon">${icon('camera',22)}</span>
          <h2>Registre seu treino</h2>
          <p class="desktop-only">Check-ins são feitos pelo celular, direto da academia.</p>
          <p class="mobile-only">Tire uma foto e escolha quais grupos vão ver seu treino.</p>
          <a href="#compose" class="btn btn-primary mobile-only">${icon('plus',17)} Novo check-in</a>
          <a href="#history" class="rail-link desktop-only">Ver meu histórico ${icon('chevron',15)}</a>
        </section>
      </aside>
    </div>
  </div>`;
}

function workoutDetail(workout) {
  if (!workout.length) return '';
  return `<section class="detail-panel"><h2>Detalhes do treino</h2><ul class="exercise-list">${workout.map((exercise) => `<li>
    <div><strong>${esc(exercise.exercise)}</strong><span>${exercise.type === 'forca' ? 'Força' : 'Cardio'}</span></div>
    ${exercise.type === 'forca' ? `<ol>${(exercise.sets || []).map((set) => `<li>${esc(set.reps)} repetições · ${esc(set.load)} kg</li>`).join('')}</ol>`
      : `<p>${esc(exercise.minutes)} min${exercise.distance !== null && exercise.distance !== undefined ? ` · ${esc(exercise.distance)} km` : ''}</p>`}
  </li>`).join('')}</ul></section>`;
}

function postDetail(id) {
  const post = state.posts.find((item) => item.id === id);
  if (!post) return '<div class="empty-card"><h1>Check-in indisponível</h1><a href="#feed" class="btn btn-secondary">Voltar ao feed</a></div>';
  const published = !post.hidden && post.groupIds.length;
  return `<div class="detail-page">
    <a class="back-link" href="#${state.user.role === 'admin' ? 'reports' : post.groupIds.length ? 'feed' : 'history'}">‹ Voltar</a>
    <h1>Check-in</h1>
    ${renderPost(post, true)}
    ${workoutDetail(post.workout)}
    ${published ? `<section class="detail-panel">
      <h2>Comentários <span class="count">${post.comments.length}</span></h2>
      ${post.comments.length ? `<ul class="comments">${post.comments.map((comment) => `<li>${avatar(person(comment.authorId))}
        <div><strong>${esc(person(comment.authorId).name)}</strong><time datetime="${esc(comment.createdAt)}">${esc(dateLabel(comment.createdAt))}</time><p>${esc(comment.text)}</p></div>
        ${comment.authorId === state.user.id
          ? `<button class="btn btn-text" type="button" data-action="comment.delete" data-id="${esc(comment.id)}" data-confirm="Excluir seu comentário?">Excluir</button>`
          : `<button class="btn btn-text" type="button" data-action="report-dialog" data-id="${esc(comment.id)}" data-type="comment">Denunciar</button>`}
      </li>`).join('')}</ul>` : '<p class="muted">Ainda não há comentários neste check-in.</p>'}
      <form class="comment-form" data-form="post.comment"><input type="hidden" name="id" value="${esc(post.id)}"><label for="comment-text" class="sr-only">Seu comentário</label><input id="comment-text" name="text" maxlength="500" placeholder="Escreva um comentário" required><button class="btn btn-primary" type="submit">Enviar</button></form>
    </section>` : ''}
  </div>`;
}

function render() {
  root.removeAttribute('aria-busy');
  if (!state.user) {
    root.innerHTML = renderAuth();
    document.title = 'Entrar · Belê GYM';
    return;
  }
  let route = getRoute();
  if (state.user.role === 'admin' && !['students', 'reports', 'profile', 'post'].includes(route.page)) route = { page: 'students' };
  if (state.user.role === 'student' && ['students', 'reports'].includes(route.page)) route = { page: 'feed' };
  const content = route.page === 'feed' ? feed()
    : route.page === 'post' ? postDetail(route.id)
    : renderView(route, state) || feed();
  root.innerHTML = shell(route, content);
  bindView(root);
  document.title = 'Belê GYM';
}

function showNotice(message, error = false, persistent = false) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.className = `notice shown${error ? ' error' : ''}`;
  if (persistent) {
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Fechar';
    close.addEventListener('click', () => { notice.className = 'notice'; });
    notice.append(' ', close);
  } else {
    noticeTimer = setTimeout(() => { notice.className = 'notice'; }, 6000);
  }
}

async function refresh() {
  const response = await fetch('/api/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar a sua conta.');
  state = await response.json();
  if (previouslyShownUser !== state.user?.id) {
    groupFilter = '';
    visiblePosts = 8;
    previouslyShownUser = state.user?.id;
  }
}

async function requestAction(action, payload) {
  let response;
  try {
    response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new Error('Sem conexão com o Belê. Tente novamente quando estiver on-line.');
  }
  const result = await response.json();
  if (!response.ok || result.error || result.ok === false) throw new Error(result.error || 'Não foi possível concluir a ação.');
  return result;
}

async function applyAction(action, payload) {
  const result = await requestAction(action, payload);
  await refresh();
  if (action === 'logout') {
    currentAuthPage = 'login';
    navigate('login');
  } else if (action === 'recover') {
    currentAuthPage = 'reset';
    render();
    root.querySelector('input[name="email"]').value = payload.email;
  } else if (action === 'reset' && !state.user) {
    currentAuthPage = 'login';
    render();
  } else if (['demo', 'login', 'activate', 'reset'].includes(action)) {
    const route = getRoute();
    const invite = route.page === 'groups' && route.id;
    navigate(state.user?.role === 'admin' ? 'students' : invite ? `groups/${route.id}` : 'feed');
  } else if (action === 'post.create') {
    navigate(payload.groupIds?.length ? 'feed' : 'history');
  } else if (action === 'post.update') {
    navigate(`post/${payload.id}`);
  } else if (action === 'post.delete') {
    navigate('history');
  } else {
    render();
  }
  const message = result.code ? `${result.message || 'Código local'}: ${result.code}` : result.message;
  if (message) showNotice(message, false, Boolean(result.code));
}

function reportDialog(id, type = 'post') {
  const subject = type === 'comment' ? 'comentário' : 'check-in';
  const dialog = document.createElement('dialog');
  dialog.className = 'report-dialog';
  dialog.innerHTML = `<form data-form="${type}.report">
    <h2>Denunciar ${subject}</h2><p>O relato será enviado à equipe da academia.</p>
    <input type="hidden" name="id" value="${esc(id)}">
    <label for="report-reason">Motivo</label><textarea id="report-reason" name="reason" required maxlength="500" rows="4"></textarea>
    <div class="report-buttons"><button class="btn btn-secondary" type="button" data-action="close-report">Cancelar</button><button class="btn btn-primary" type="submit">Enviar denúncia</button></div>
  </form>`;
  root.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || target.tagName === 'FORM' || target.type === 'submit') return;
  event.preventDefault();
  const { action, confirm: confirmation, ...payload } = target.dataset;
  if (action === 'auth-page') { currentAuthPage = payload.page; render(); return; }
  if (action === 'load-more') {
    const scroll = window.scrollY;
    visiblePosts += 8;
    render();
    window.scrollTo(0, scroll);
    return;
  }
  if (action === 'report-dialog') { reportDialog(payload.id, payload.type); return; }
  if (action === 'close-report') { target.closest('dialog').close(); return; }
  if (busy) return;
  const confirmations = {
    'post.delete': 'Excluir este check-in, incluindo a foto, treino e conversa?',
    'post.removeGroup': 'Retirar este check-in deste grupo?',
    'group.leave': 'Sair deste grupo?',
    'student.active': payload.active === 'false' ? 'Desativar o acesso deste aluno?' : 'Reativar o acesso deste aluno?',
    'report.review': payload.remove === 'true' ? 'Remover a publicação e preservar o treino no histórico do autor?' : null,
  };
  const prompt = confirmation || confirmations[action];
  if (prompt && !window.confirm(prompt)) return;
  for (const key of ['active', 'approved', 'remove', 'liked']) {
    if (key in payload) payload[key] = payload[key] === 'true';
  }
  busy = true;
  target.disabled = true;
  try {
    const scroll = window.scrollY;
    await applyAction(action, payload);
    if (action === 'post.like') window.scrollTo(0, scroll);
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    target.disabled = false;
    busy = false;
  }
});

root.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  if (busy) return;
  const action = form.dataset.form;
  const submit = event.submitter || form.querySelector('[type="submit"]');
  busy = true;
  if (submit) submit.disabled = true;
  try {
    const payload = await parseViewForm(form) ?? Object.fromEntries(new FormData(form));
    if (action === 'post.create' && matchMedia('(min-width: 1024px)').matches) {
      throw new Error('Check-ins são feitos pelo celular, direto da academia.');
    }
    await applyAction(action, payload);
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    if (submit) submit.disabled = false;
    busy = false;
  }
});

root.addEventListener('change', (event) => {
  if (event.target.id !== 'group-filter') return;
  groupFilter = event.target.value;
  visiblePosts = 8;
  render();
  document.querySelector('#group-filter')?.focus();
});

root.addEventListener('click', (event) => {
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    document.querySelector('#main-content')?.focus();
  }
});

window.addEventListener('hashchange', async () => {
  const version = ++routeVersion;
  const route = getRoute();
  try {
    if (version !== routeVersion) return;
    render();
    window.scrollTo(0, 0);
  } catch {
    if (version !== routeVersion) return;
    if (route.page === 'post' || route.page === 'group') {
      root.innerHTML = shell(route, '<div class="empty-card"><h1>Conteúdo indisponível</h1><p>Verifique a conexão com o servidor local e tente novamente.</p><a href="#feed" class="btn btn-secondary">Voltar ao feed</a></div>');
    } else {
      showNotice('Não foi possível atualizar os dados. Verifique a conexão com o servidor local.', true);
    }
  }
});

async function start() {
  try {
    await refresh();
    const params = new URLSearchParams(location.search);
    const preview = params.get('demo');
    if (preview && (!state.user || (preview === 'academia') !== (state.user.role === 'admin'))) {
      await requestAction('demo', { role: preview === 'academia' ? 'admin' : 'student' });
      await refresh();
    }
    if (preview || params.has('intro')) history.replaceState(null, '', `/${location.hash}`);
    render();
    window.dispatchEvent(new Event('bele:ready'));
  } catch (error) {
    root.innerHTML = '<main class="loading"><h1>Belê GYM</h1><p>O servidor local está indisponível.</p><button type="button" class="btn btn-primary" id="retry">Tentar novamente</button></main>';
    root.querySelector('#retry').addEventListener('click', start);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !state.user || busy) return;
  try { await refresh(); render(); } catch { /* Mantém a última tela disponível se a rede oscilar. */ }
});

start();
