const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Fortaleza',
});
const localCalendar = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Fortaleza',
});
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const activeViews = new WeakSet();
const postRequests = new WeakMap();
const roleLabels = { owner: 'Dono', admin: 'Admin', member: 'Membro' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
  ));
}

function part(value) {
  return encodeURIComponent(value ?? '');
}

function safeImage(value) {
  const url = String(value ?? '');
  return /^(?:\/assets\/|assets\/|\.\/assets\/|\/(?:api\/)?(?:media|photo|photos|uploads)\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(url)
    ? esc(url)
    : '';
}

function dateText(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.valueOf()) ? dateFormat.format(date) : 'Data indisponível';
}

function calendarToday() {
  const parts = Object.fromEntries(localCalendar.formatToParts(new Date()).map(({type, value}) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function birthText(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value.split('-').reverse().join('/') : 'Não informado';
}

function isMinor(birthDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate ?? '')) return false;
  const today = calendarToday();
  const adultYear = Number(today.slice(0, 4)) - 18;
  return birthDate > `${adultYear}${today.slice(4)}`;
}

function initials(value) {
  return (String(value ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((word) => Array.from(word)[0]).join('') || 'B').toUpperCase();
}

function avatar(user) {
  const image = safeImage(user?.avatar);
  return `<span class="view-avatar" aria-hidden="true">${image
    ? `<img src="${image}" alt="">`
    : esc(initials(user?.name))}</span>`;
}

function person(state, id) {
  return state.users?.find((user) => user.id === id)
    ?? (id === state.user?.id ? state.user : { name: 'Aluno' });
}

function action(label, name, attributes = {}, style = 'plain') {
  const data = Object.entries(attributes).map(([key, value]) => ` data-${key}="${esc(value)}"`).join('');
  return `<button type="button" class="view-btn view-btn--${style}" data-action="${name}"${data}>${esc(label)}</button>`;
}

function link(label, route, style = 'plain') {
  return `<a class="view-btn view-btn--${style}" href="#${esc(route)}">${esc(label)}</a>`;
}

function submit(label) {
  return `<button class="view-btn view-btn--brand" type="submit">${esc(label)}</button>`;
}

function header(title, description, back) {
  return `<header class="view-header">
    ${back ? `<a class="view-back" href="#${esc(back.route)}">${esc(back.label)}</a>` : ''}
    <h1>${esc(title)}</h1>
    ${description ? `<p class="view-dim">${esc(description)}</p>` : ''}
  </header>`;
}

function page(content) {
  return `<section class="workspace-view">${content}</section>`;
}

function unavailable(title, text, route = 'feed', label = 'Voltar ao feed') {
  return page(`${header(title, text)}<div>${link(label, route)}</div>`);
}

function photoInput(current, use = 'checkin') {
  const image = safeImage(current);
  const isAvatar = use === 'avatar';
  const accept = 'image/jpeg,image/png,image/webp';
  const imageAlt = isAvatar ? 'Prévia da foto de perfil' : 'Prévia da foto do check-in';
  return `<div class="view-uploader" data-uploader>
    <div class="view-photo-preview${isAvatar ? ' view-photo-preview--avatar' : ''}">
      <img alt="${imageAlt}" data-photo-preview ${image ? `src="${image}"` : 'hidden'}>
      <span data-photo-placeholder ${image ? 'hidden' : ''}>${isAvatar ? 'Nenhuma foto de perfil' : 'Adicione uma foto do check-in'}</span>
    </div>
    <div class="view-actions">
      <label class="view-file view-btn view-btn--plain">
        <span>Escolher da galeria</span><input type="file" data-photo-input accept="${accept}">
      </label>
      ${isAvatar ? '' : `<label class="view-file view-btn view-btn--plain">
        <span>Usar câmera</span><input type="file" data-photo-input accept="${accept}" capture="environment">
      </label>`}
    </div>
    <p class="view-inline-error" data-photo-error role="status" hidden></p>
  </div>`;
}

function activeGroups(state) {
  return (state.groups ?? []).filter((group) => !group.archived && ownMembership(group, state));
}

function ownMembership(group, state) {
  return group.members?.find((member) => member.userId === state.user?.id);
}

function audienceInput(groups, post) {
  if (!groups.length) {
    return `<fieldset><legend>Audiência</legend>
      <p class="view-quiet">Só você verá este check-in no seu histórico.</p>
    </fieldset>`;
  }
  const selected = post?.groupIds ?? [];
  const allSelected = !post || groups.every((group) => selected.includes(group.id));
  return `<fieldset class="view-stack" data-audience>
    <legend>Audiência</legend>
    <div class="view-row">
      <label class="view-check"><input type="radio" name="audience" value="all"${allSelected ? ' checked' : ''}> Todos os meus grupos</label>
      <label class="view-check"><input type="radio" name="audience" value="selected"${allSelected ? '' : ' checked'}> Selecionar grupos</label>
    </div>
    <div class="view-grid view-grid--compact" data-group-selection${allSelected ? ' hidden' : ''}>
      ${groups.map((group) => `<label class="view-check"><input type="checkbox" name="groupIds"
        value="${esc(group.id)}"${!post || selected.includes(group.id) ? ' checked' : ''}> ${esc(group.name)}</label>`).join('')}
    </div>
    <p class="view-quiet" aria-live="polite" data-audience-status>${allSelected || selected.length
      ? 'Seu check-in ficará visível para os participantes dos grupos selecionados.'
      : 'Só você verá este check-in no seu histórico.'}</p>
  </fieldset>`;
}

function seriesRow(set = {}) {
  return `<div class="view-series-row" data-series-row>
    <label>Repetições<input type="number" data-reps min="1" max="1000" step="1" required value="${esc(set.reps)}"></label>
    <label>Carga (kg)<input type="text" data-load inputmode="decimal" required value="${esc(set.load)}"></label>
    <button class="view-btn view-btn--plain" type="button" data-remove-series aria-label="Remover série" title="Remover série">×</button>
  </div>`;
}

function exerciseCard(entry = {}) {
  const cardio = entry.type === 'cardio';
  const series = entry.sets?.length ? entry.sets : [{}];
  const first = series[0];
  const uniform = series.every((item) => item.load === first.load && item.reps === first.reps);
  return `<div class="view-exercise" data-exercise data-type="${cardio ? 'cardio' : 'forca'}">
    <div class="view-row view-row--apart">
      <h3>${cardio ? 'Cardio' : 'Força'}</h3>
      <button type="button" class="view-btn view-btn--plain" data-remove-exercise>Remover exercício</button>
    </div>
    <label>Exercício <input type="text" data-exercise-name maxlength="100" required list="view-exercises-${cardio ? 'cardio' : 'forca'}" value="${esc(entry.exercise)}" placeholder="Nome do exercício"></label>
    ${cardio ? `<div class="view-grid view-grid--compact">
      <label>Tempo (min)<input type="text" data-minutes inputmode="decimal" required value="${esc(entry.minutes)}"></label>
      <label>Distância (km, opcional)<input type="text" data-distance inputmode="decimal" value="${esc(entry.distance)}"></label>
    </div>` : `<label>Como registrar as séries
      <select data-workout-mode><option value="summary"${uniform ? ' selected' : ''}>Séries iguais</option><option value="detail"${uniform ? '' : ' selected'}>Séries detalhadas</option></select>
    </label>
    <fieldset data-summary${uniform ? '' : ' disabled hidden'} aria-label="Séries iguais">
      <div class="view-grid view-grid--compact">
        <label>Séries<input type="number" data-set-count min="1" max="100" step="1" required value="${series.length}"></label>
        <label>Repetições<input type="number" data-reps min="1" max="1000" step="1" required value="${esc(first.reps)}"></label>
        <label>Carga (kg)<input type="text" data-load inputmode="decimal" required value="${esc(first.load)}"></label>
      </div>
    </fieldset>
    <fieldset data-detail${uniform ? ' disabled hidden' : ''} aria-label="Séries detalhadas">
      <div data-series>${series.map(seriesRow).join('')}</div>
      <div class="view-actions view-series-actions"><button type="button" class="view-btn view-btn--plain" data-add-series>Adicionar série</button></div>
    </fieldset>
    <p class="view-inline-error" data-mode-error role="status" hidden></p>`}
  </div>`;
}

function workoutEditor(state, post) {
  const entries = post?.workout ?? [];
  const exercises = state.exercises ?? [];
  return `<details class="view-disclosure" ${entries.length ? 'open' : ''}>
    <summary>${entries.length ? 'Editar treino' : 'Anexar treino (opcional)'}</summary>
    <div class="view-stack">
      ${['forca', 'cardio'].map((type) => `<datalist id="view-exercises-${type}">${exercises.filter((entry) => entry.type === type)
        .map((entry) => `<option value="${esc(entry.name)}"></option>`).join('')}</datalist>`).join('')}
      <div class="view-stack" data-workout-entries>${entries.map(exerciseCard).join('')}</div>
      <div class="view-actions">
        <button class="view-btn view-btn--plain" type="button" data-add-exercise="forca">Adicionar força</button>
        <button class="view-btn view-btn--plain" type="button" data-add-exercise="cardio">Adicionar cardio</button>
      </div>
    </div>
  </details>`;
}

function compose(route, state) {
  const post = route.id && state.posts?.find((entry) => entry.id === route.id && entry.authorId === state.user.id);
  if (route.id && (!post || !post.editable)) {
    return unavailable('Edição indisponível', 'A edição fica disponível até o fim do dia do check-in, no horário de Fortaleza.', 'history', 'Ir para o histórico');
  }
  const groups = post?.hidden ? [] : activeGroups(state).filter((group) => !post?.blockedGroupIds?.includes(group.id));
  const share = post?.shareWorkout ?? state.user.shareWorkout ?? true;
  return page(`
    ${header(post ? 'Editar check-in' : 'Novo check-in', post ? 'Você pode ajustar a audiência e os detalhes do treino até o fim do dia, no horário de Fortaleza.' : '', { route: post ? `post/${part(post.id)}` : 'feed', label: 'Voltar' })}
    ${post ? '' : `<div class="view-card view-stack view-desktop-offer">
      <h2>Check-ins são feitos pelo celular, direto da academia</h2>
      <p class="view-dim">No computador, você pode consultar seu histórico e completar o treino dentro do prazo.</p>
      <div>${link('Ver meu histórico', 'history')}</div>
    </div>`}
    <form class="view-form${post ? '' : ' view-mobile-composer'}" data-form="${post ? 'post.update' : 'post.create'}">
      ${post ? `<input type="hidden" name="id" value="${esc(post.id)}">` : `<section class="view-card view-stack"><h2>Foto do check-in</h2>${photoInput()}</section>`}
      <section class="view-card view-stack">
        ${post?.hidden ? '<p class="view-quiet">Publicação removida pela academia. Este registro fica no seu histórico.</p>' : audienceInput(groups, post)}
        <label class="view-check"><input type="checkbox" name="shareWorkout"${share ? ' checked' : ''}> Compartilhar detalhes do treino com a audiência</label>
      </section>
      <section class="view-card">${workoutEditor(state, post)}</section>
      <div class="view-actions">${submit(post ? 'Salvar alterações' : 'Publicar check-in')}${link('Cancelar', post ? `post/${part(post.id)}` : 'feed')}</div>
    </form>`);
}

function status(label, type = '') {
  return `<span class="view-status${type ? ` view-status--${type}` : ''}">${esc(label)}</span>`;
}

function groupCard(group, state) {
  const member = ownMembership(group, state);
  const count = group.members?.length ?? 0;
  return `<a class="view-shell-link view-card view-group-card" href="#group/${part(group.id)}">
    <span class="view-group-glyph" aria-hidden="true">${esc(initials(group.name))}</span>
    <div class="view-stack view-group-copy">
      <div class="view-row view-row--apart"><h3>${esc(group.name)}</h3>${status(roleLabels[member.role] ?? 'Membro', 'active')}</div>
      <p class="view-dim">${count} ${count === 1 ? 'participante' : 'participantes'}${group.description ? ` · ${esc(group.description)}` : ''}</p>
    </div>
  </a>`;
}

function groupsView(route, state) {
  const groups = activeGroups(state);
  const pending = (state.groups ?? []).filter((group) => group.requests?.some((request) => (
    request.userId === state.user.id
  )) && !ownMembership(group, state) && !group.archived);
  const memberships = groups.length + pending.length;
  const limited = memberships >= 5;
  return page(`
    ${header('Grupos', 'Compartilhe seus check-ins com quem treina com você.')}
    <div class="view-row view-row--apart"><h2>Meus grupos</h2><p class="view-dim">${memberships} de 5 vagas entre grupos e pedidos</p></div>
    <div class="view-list">${groups.length
      ? groups.map((group) => groupCard(group, state)).join('')
      : '<div class="view-card"><p class="view-dim">Você ainda não participa de um grupo.</p></div>'}
    </div>
    ${pending.length ? `<section class="view-card view-stack"><h2>Pedidos pendentes</h2>${pending.map((group) => `
      <div class="view-member">
        <div class="view-member-info"><h3>${esc(group.name)}</h3><p class="view-dim">Aguardando aprovação</p></div>
        ${action('Cancelar pedido', 'group.cancel', { id: group.id })}
      </div>`).join('')}</section>` : ''}
    <div class="view-grid">
      <section class="view-card view-stack"><h2>Criar grupo</h2>
        <form class="view-form" data-form="group.create">
          <label>Nome do grupo<input name="name" type="text" maxlength="64" required></label>
          <label>Descrição (opcional)<input name="description" type="text" maxlength="160"></label>
          <div><button type="submit" class="view-btn view-btn--brand"${limited ? ' disabled' : ''}>Criar grupo</button></div>
        </form>
      </section>
      <section class="view-card view-stack"><h2>Entrar com convite</h2>
        <form class="view-form" data-form="group.join">
          <label>Código do grupo<input name="code" type="text" maxlength="64" value="${esc(route.id)}" required autocomplete="off"></label>
          <div><button type="submit" class="view-btn view-btn--brand"${limited ? ' disabled' : ''}>Solicitar entrada</button></div>
        </form>
      </section>
    </div>`);
}

function memberRow(member, group, state, selfRole) {
  const user = person(state, member.userId);
  const other = member.userId !== state.user.id;
  const canManage = selfRole === 'owner' || selfRole === 'admin' && member.role === 'member';
  const attributes = { id: group.id, 'user-id': member.userId };
  return `<div class="view-member">
    <div class="view-row">${avatar(user)}
      <div class="view-member-info"><strong>${esc(user.name)}${other ? '' : ' (você)'}</strong><span class="view-dim">${roleLabels[member.role] ?? 'Membro'}</span></div>
    </div>
    ${other && canManage ? `<div class="view-actions">
      ${selfRole === 'owner' && member.role !== 'owner' ? action(member.role === 'admin' ? 'Rebaixar' : 'Promover a admin', 'group.member', {
        ...attributes, operation: member.role === 'admin' ? 'demote' : 'promote',
      }) : ''}
      ${selfRole === 'owner' && member.role !== 'owner'
        ? action('Transferir posse', 'group.transfer', { ...attributes, confirm: 'Transferir a posse do grupo para este participante?' })
        : ''}
      ${member.role === 'owner' ? '' : action('Remover', 'group.member', {
        ...attributes, operation: 'remove', confirm: 'Remover este participante do grupo?',
      }, 'danger')}
    </div>` : ''}
  </div>`;
}

function groupDetails(route, state) {
  const group = state.groups?.find((item) => item.id === route.id && !item.archived);
  const membership = group && ownMembership(group, state);
  if (!group || !membership) return unavailable('Grupo indisponível', 'Você precisa participar do grupo para ver suas publicações.', 'groups', 'Meus grupos');
  const canManage = ['owner', 'admin'].includes(membership.role);
  const requests = canManage ? group.requests ?? [] : [];
  const posts = (state.posts ?? []).filter((post) => post.groupIds?.includes(group.id) && !post.hidden);
  return page(`
    ${header(group.name, group.description, { route: 'groups', label: 'Meus grupos' })}
    <section class="view-card view-stack">
      <div class="view-row view-row--apart"><h2>Participantes</h2>${status(`${group.members.length} de 15`)}</div>
      <div>${group.members.map((member) => memberRow(member, group, state, membership.role)).join('')}</div>
      ${group.code ? `<div class="view-stack">
        <h3>Convite do grupo</h3>
        <div class="view-actions"><code class="view-code">${esc(group.code)}</code>
          <button class="view-btn view-btn--plain" type="button" data-copy-code="${esc(group.code)}">Copiar código</button>
          <button class="view-btn view-btn--plain" type="button" data-copy-link="${esc(group.code)}">Copiar link</button>
          ${membership.role === 'owner' ? action('Renovar código', 'group.renew', { id: group.id, confirm: 'O convite anterior perderá a validade. Renovar código?' }) : ''}
        </div>
        <p class="view-dim" data-copy-status aria-live="polite" hidden></p>
      </div>` : ''}
    </section>
    ${canManage ? `<section class="view-card view-stack"><h2>Pedidos de entrada</h2>
      ${requests.length ? `<div>${requests.map((request) => `<div class="view-member">
        <strong>${esc(person(state, request.userId).name)}</strong>
        <div class="view-actions">
          ${action('Aprovar', 'group.review', { id: group.id, 'user-id': request.userId, approved: true }, 'brand')}
          ${action('Recusar', 'group.review', { id: group.id, 'user-id': request.userId, approved: false })}
        </div>
      </div>`).join('')}</div>` : '<p class="view-dim">Nenhum pedido aguardando aprovação.</p>'}
    </section>` : ''}
    <section class="view-card view-stack"><h2>Check-ins do grupo</h2>
      ${posts.length ? `<div>${posts.map((post) => historyItem(post, state, true)).join('')}</div>`
        : '<p class="view-dim">As publicações compartilhadas com o grupo aparecem aqui.</p>'}
    </section>
    <div class="view-card view-stack">
      ${membership.role === 'owner' && group.members.length > 1 ? `<div class="view-form">
        <label>Sucessor ao sair
          <select data-group-successor><option value="">Escolher automaticamente</option>
            ${group.members.filter((member) => member.userId !== state.user.id).map((member) => `<option value="${esc(member.userId)}">${esc(person(state, member.userId).name)}</option>`).join('')}
          </select>
        </label>
      </div>` : ''}
      <div>${action('Sair do grupo', 'group.leave', {
      id: group.id,
      confirm: membership.role === 'owner'
        ? 'Ao sair, o sucessor selecionado assume o grupo. Na seleção automática, assume o admin ou membro mais antigo. Sem participantes, o grupo é arquivado. Sair do grupo?'
        : 'Você deixará de receber os novos check-ins deste grupo. Sair do grupo?',
    }, 'danger')}</div>
    </div>`);
}

function historyItem(post, state, social = false) {
  const photo = post.hidden ? '' : safeImage(post.photo);
  const amount = post.workout?.length ?? 0;
  const subtitle = post.hidden ? 'Publicação removida pela academia' : [
    !social ? post.groupIds?.length ? 'Compartilhado' : 'Privado' : null,
    amount ? `${amount} ${amount === 1 ? 'exercício' : 'exercícios'}` : 'Sem treino',
    !social && !post.editable ? 'Prazo de edição encerrado' : null,
  ].filter(Boolean).join(' · ');
  return `<div class="view-history-item">
    <span class="view-history-thumb">${photo ? `<img src="${photo}" loading="lazy" alt="">` : '<span>Sem foto</span>'}</span>
    <div class="view-history-copy">
      <h3>${esc(social ? person(state, post.authorId).name : dateText(post.createdAt))}</h3>
      <p class="view-dim">${esc(social ? dateText(post.createdAt) : subtitle)}</p>
    </div>
    <div class="view-actions">${link('Ver detalhes', `post/${part(post.id)}`)}${!social && post.editable ? link('Editar', `compose/${part(post.id)}`) : ''}</div>
  </div>`;
}

function historyView(state, route) {
  const own = !route.id || route.id === state.user.id;
  const shared = activeGroups(state).some((group) => group.members.some((member) => member.userId === route.id));
  const user = own ? state.user : shared ? state.users?.find((entry) => entry.id === route.id) : null;
  if (!user) return unavailable('Perfil indisponível', 'O perfil não está disponível para você.');
  const posts = (state.posts ?? []).filter((post) => post.authorId === user.id && (own || !post.hidden))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return page(`
    ${header(own ? 'Meu histórico' : user.name, own ? 'Revise seus check-ins e treinos, incluindo os registros privados.' : 'Check-ins compartilhados com você.')}
    <div class="view-actions">${own ? link('Editar perfil', 'profile') : avatar(user)}</div>
    <section class="view-card view-stack"><h2>Check-ins</h2>
      ${posts.length ? `<div>${posts.map((post) => historyItem(post, state, !own)).join('')}</div>`
        : '<p class="view-dim">Nenhum check-in disponível.</p>'}
    </section>`);
}

function exerciseTypeInput(selected) {
  return `<label>Tipo<select name="type">
    <option value="forca"${selected === 'forca' ? ' selected' : ''}>Força</option>
    <option value="cardio"${selected === 'cardio' ? ' selected' : ''}>Cardio</option>
  </select></label>`;
}

function catalog(state) {
  const custom = (state.exercises ?? []).filter((entry) => entry.custom);
  const used = new Set(state.posts
    .filter((post) => post.authorId === state.user.id)
    .flatMap((post) => post.workout?.map((entry) => entry.exerciseId) ?? []));
  return `<section class="view-card view-stack">
    <h2>Meus exercícios personalizados</h2>
    ${custom.length ? `<div>${custom.map((entry) => `<div class="view-member">
      <span class="view-member-info"><strong>${esc(entry.name)}</strong><span class="view-dim">${entry.type === 'cardio' ? 'Cardio' : 'Força'}</span></span>
      ${used.has(entry.id) ? status('Vinculado a um treino') : `<details class="view-disclosure view-catalog-edit">
        <summary>Editar exercício</summary>
        <form class="view-form" data-form="exercise.update">
          <input type="hidden" name="id" value="${esc(entry.id)}">
          <label>Nome<input name="name" type="text" maxlength="100" required value="${esc(entry.name)}"></label>
          ${exerciseTypeInput(entry.type)}
          <div class="view-actions">
            ${submit('Salvar exercício')}
            ${action('Excluir exercício', 'exercise.delete', { id: entry.id, confirm: 'Excluir este exercício do seu catálogo?' }, 'danger')}
          </div>
        </form>
      </details>`}
    </div>`).join('')}</div>` : '<p class="view-dim">Inclua exercícios para encontrá-los quando montar um treino.</p>'}
    <details class="view-disclosure">
      <summary>Adicionar exercício</summary>
      <form class="view-form" data-form="exercise.create">
        <div class="view-grid">
          <label>Nome<input name="name" type="text" maxlength="100" required></label>
          ${exerciseTypeInput()}
        </div>
        <div>${submit('Criar exercício')}</div>
      </form>
    </details>
  </section>`;
}

function profileView(state, route) {
  if (route.id && route.id !== state.user.id) return historyView(state, route);
  return page(`
    ${header('Meu perfil', '', { route: state.user.role === 'admin' ? 'students' : 'history', label: 'Voltar' })}
    <form class="view-card view-form" data-form="profile.update">
      <h2>Dados do perfil</h2>
      ${photoInput(state.user.avatar, 'avatar')}
      <label>Nome<input name="name" type="text" maxlength="80" value="${esc(state.user.name)}" required autocomplete="name"></label>
      ${state.user.email ? `<p class="view-dim">${esc(state.user.email)}</p>` : ''}
      ${state.user.role === 'student' ? `<label class="view-check"><input name="shareWorkout" type="checkbox"${state.user.shareWorkout !== false ? ' checked' : ''}> Compartilhar detalhes do treino por padrão</label>` : ''}
      <div class="view-actions">${submit('Salvar perfil')}</div>
    </form>
    ${state.user.role === 'student' ? catalog(state) : ''}
    <div class="view-actions">
      ${state.user.role === 'student' ? link('Meu histórico', 'history') : ''}
      ${action('Sair da conta', 'logout')}
    </div>`);
}

function studentRecord(user) {
  const birth = birthText(user.birthDate);
  const minor = user.minor ?? isMinor(user.birthDate);
  const awaiting = user.status === 'invited' || user.status === 'pending' || user.activated === false;
  const studentStatus = !user.active ? status('Inativo', 'inactive')
    : awaiting ? status('Aguardando ativação', 'pending') : status('Ativo', 'active');
  return `<details class="view-student" data-filter-student data-search="${esc(`${user.name} ${user.email ?? ''}`)}">
    <summary><span class="view-member-info"><strong>${esc(user.name)}</strong><span class="view-dim">${esc(user.email)}</span></span>${studentStatus}</summary>
    <div class="view-record-body">
      <dl class="view-record-details">
        <div><dt>Nascimento</dt><dd>${esc(birth)}</dd></div>
        <div><dt>Faixa etária</dt><dd>${user.birthDate ? minor ? 'Menor de idade' : 'Maior de idade' : 'Não informada'}</dd></div>
        <div><dt>Autorização</dt><dd>${minor ? user.guardian ? 'Registrada' : 'Pendente' : 'Não exigida para maior de idade'}</dd></div>
      </dl>
      <form class="view-form" data-form="student.update">
        <input type="hidden" name="id" value="${esc(user.id)}">
        <div class="view-grid view-grid--center">
          <p class="view-dim">A data de nascimento foi definida no cadastro e não pode ser alterada.</p>
          <label class="view-check"><input name="guardian" type="checkbox"${user.guardian ? ' checked' : ''}${user.active && !awaiting && minor && user.guardian ? ' disabled' : ''}> Registrar autorização do responsável</label>
        </div>
        <div>${submit('Salvar correção')}</div>
      </form>
      <div class="view-actions">
        ${awaiting && user.active ? `<form data-form="student.invite">
          <input type="hidden" name="name" value="${esc(user.name)}">
          <input type="hidden" name="email" value="${esc(user.email)}">
          <input type="hidden" name="birthDate" value="${esc(user.birthDate)}">
          <input type="hidden" name="guardian" value="${Boolean(user.guardian)}">
          <button class="view-btn view-btn--plain" type="submit">Renovar convite</button>
        </form>` : ''}
        ${action(user.active ? 'Desativar aluno' : 'Reativar aluno', 'student.active', {
          id: user.id, active: !user.active,
          confirm: user.active
            ? 'O aluno perderá o acesso e sairá dos grupos. O histórico será preservado. Desativar aluno?'
            : 'O aluno voltará a ter acesso e poderá pedir entrada nos grupos. Reativar aluno?',
        }, user.active ? 'danger' : 'plain')}
      </div>
    </div>
  </details>`;
}

function studentsView(state) {
  const users = (state.users ?? []).filter((user) => user.role !== 'admin')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return page(`
    ${header('Alunos', 'Gerencie cadastros, convites e acesso à plataforma.')}
    <section class="view-card view-stack">
      <h2>Alunos cadastrados</h2>
      <div class="view-form"><label>Buscar por nome ou e-mail<input type="search" data-student-search autocomplete="off"></label></div>
      <div data-student-results>${users.map(studentRecord).join('')}</div>
      <p class="view-empty" data-student-empty hidden>Nenhum aluno encontrado.</p>
      <div class="view-row view-row--apart" data-student-navigation hidden>
        <button type="button" class="view-btn view-btn--plain" data-student-page="-1">Anterior</button>
        <span class="view-dim" aria-live="polite" data-student-page-label></span>
        <button type="button" class="view-btn view-btn--plain" data-student-page="1">Próxima</button>
      </div>
    </section>
    <section class="view-card view-stack">
      <h2>Pré-cadastrar aluno</h2>
      <form class="view-form" data-form="student.invite">
        <div class="view-grid">
          <label>Nome<input name="name" type="text" maxlength="80" required autocomplete="off"></label>
          <label>E-mail<input name="email" type="email" maxlength="254" required autocomplete="off"></label>
          <label>Nascimento<input name="birthDate" type="date" max="${calendarToday()}" required></label>
        </div>
        <label class="view-check"><input name="guardian" type="checkbox"> Autorização do responsável registrada</label>
        <p class="view-dim">Para menores de idade, a autorização é necessária para ativar o acesso.</p>
        <div>${submit('Cadastrar aluno')}</div>
      </form>
    </section>`);
}

function reportRecord(report, state) {
  const target = report.target ?? state.posts?.find((post) => post.id === report.postId);
  const isComment = report.targetType === 'comment' || !!report.commentId;
  const comment = isComment ? target?.comments?.find((item) => item.id === report.commentId) : null;
  const text = report.commentText ?? comment?.text ?? (isComment ? target?.text : null);
  const photo = isComment ? '' : safeImage(target?.photo ?? report.photo);
  const open = !report.status || ['pending', 'open', 'aberta', 'pendente'].includes(report.status);
  const removed = ['removed', 'removida'].includes(report.status);
  return `<article class="view-card view-stack">
    <div class="view-row view-row--apart">
      <h2>${isComment ? 'Comentário denunciado' : 'Check-in denunciado'}</h2>
      ${status(open ? 'Em análise' : removed ? 'Conteúdo removido' : 'Encerrada', open ? 'pending' : '')}
    </div>
    <p class="view-dim">${esc(dateText(report.createdAt))}</p>
    ${report.reason ? `<p class="view-review-note">${esc(report.reason)}</p>` : ''}
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${photo && open ? `<img src="${photo}" class="view-report-image" alt="Foto denunciada" loading="lazy">` : ''}
    ${open ? `<div class="view-actions">
      ${action('Descartar denúncia', 'report.review', { id: report.id, remove: false })}
      ${action('Remover conteúdo', 'report.review', {
        id: report.id,
        remove: true,
        confirm: isComment
          ? 'Remover este comentário?'
          : 'O check-in e a foto serão removidos da área social. O treino seguirá no histórico do aluno. Remover publicação?',
      }, 'danger')}
    </div>` : ''}
  </article>`;
}

function reportsView(state) {
  const reports = [...(state.reports ?? [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return page(`
    ${header('Denúncias', 'Analise publicações e comentários sinalizados pelos alunos.')}
    ${reports.length ? reports.map((report) => reportRecord(report, state)).join('')
      : '<div class="view-card"><p class="view-dim">Nenhuma denúncia registrada.</p></div>'}`);
}

export function renderView(route, state) {
  const memberRoutes = { compose, groups: groupsView, group: groupDetails, history: (value, data) => historyView(data, value), profile: (value, data) => profileView(data, value) };
  if (route.page === 'students' || route.page === 'reports') {
    if (state.user?.role !== 'admin') return unavailable('Acesso restrito', 'Esta área é reservada à equipe da academia.');
    return route.page === 'students' ? studentsView(state) : reportsView(state);
  }
  return state.user && Object.hasOwn(memberRoutes, route.page) ? memberRoutes[route.page](route, state) : '';
}

function appendMarkup(container, markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const item = template.content.firstElementChild;
  container.append(template.content);
  return item;
}

function syncAudience(fieldset) {
  const all = fieldset.querySelector('input[name="audience"]:checked').value === 'all';
  const selection = fieldset.querySelector('[data-group-selection]');
  const selected = all || Boolean(selection.querySelector('input:checked'));
  selection.hidden = all;
  fieldset.querySelector('[data-audience-status]').textContent = selected
    ? 'Seu check-in ficará visível para os participantes dos grupos selecionados.'
    : 'Só você verá este check-in no seu histórico.';
}

function syncRemoveSeries(exercise) {
  const buttons = exercise.querySelectorAll('[data-remove-series]');
  buttons.forEach((button) => { button.disabled = buttons.length === 1; });
}

function rawSeries(container) {
  return {
    reps: container.querySelector('[data-reps]').value,
    load: container.querySelector('[data-load]').value,
  };
}

function switchWorkoutMode(select) {
  const exercise = select.closest('[data-exercise]');
  const summary = exercise.querySelector('[data-summary]');
  const detail = exercise.querySelector('[data-detail]');
  const series = exercise.querySelector('[data-series]');
  const message = exercise.querySelector('[data-mode-error]');
  const toSummary = select.value === 'summary';
  message.hidden = true;
  if (toSummary) {
    const sets = Array.from(series.querySelectorAll('[data-series-row]'), rawSeries);
    const first = sets[0];
    if (sets.some((entry) => entry.reps !== first.reps || entry.load.replace(',', '.') !== first.load.replace(',', '.'))) {
      select.value = 'detail';
      message.textContent = 'Registre séries com valores diferentes no modo detalhado.';
      message.hidden = false;
      return;
    }
    summary.querySelector('[data-set-count]').value = sets.length;
    summary.querySelector('[data-reps]').value = first.reps;
    summary.querySelector('[data-load]').value = first.load;
  } else {
    const count = Math.max(1, Math.min(100, Math.floor(Number(summary.querySelector('[data-set-count]').value)) || 1));
    series.innerHTML = Array.from({ length: count }, () => seriesRow(rawSeries(summary))).join('');
    syncRemoveSeries(exercise);
  }
  summary.hidden = summary.disabled = !toSummary;
  detail.hidden = detail.disabled = toSummary;
}

const imageCache = new WeakMap();
const photoSelections = new WeakMap();

async function prepareImage(file) {
  if (!allowedImageTypes.has(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Escolha uma foto de até 20 MB.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/jpeg', .86);
    if (data.length > 4 * 1024 * 1024) data = canvas.toDataURL('image/jpeg', .65);
    if (!data.startsWith('data:image/jpeg;') || data.length > 4 * 1024 * 1024) {
      throw new Error('Escolha uma foto menor.');
    }
    return data;
  } catch (error) {
    if (error.message === 'Escolha uma foto menor.') throw error;
    throw new Error('Falha ao abrir a foto. Escolha outra imagem.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function imageData(file) {
  if (!imageCache.has(file)) imageCache.set(file, prepareImage(file));
  return imageCache.get(file);
}

async function previewPhoto(input) {
  const uploader = input.closest('[data-uploader]');
  const file = input.files[0];
  if (!file) return;
  const preview = uploader.querySelector('[data-photo-preview]');
  const placeholder = uploader.querySelector('[data-photo-placeholder]');
  const message = uploader.querySelector('[data-photo-error]');
  uploader.querySelectorAll('[data-photo-input]').forEach((field) => {
    if (field !== input) field.value = '';
  });
  photoSelections.set(uploader, file);
  message.hidden = true;
  try {
    const image = await imageData(file);
    if (photoSelections.get(uploader) !== file) return;
    preview.src = image;
    preview.hidden = false;
    placeholder.hidden = true;
  } catch (error) {
    if (photoSelections.get(uploader) !== file) return;
    message.textContent = error.message;
    message.hidden = false;
  }
}

function normalizeSearch(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('pt-BR');
}

function studentPage(root, requested = 0) {
  const search = root.querySelector('[data-student-search]');
  if (!search) return;
  const query = normalizeSearch(search.value);
  const records = [...root.querySelectorAll('[data-filter-student]')];
  const matches = records.filter((student) => normalizeSearch(student.dataset.search).includes(query));
  const size = 10;
  const pageCount = Math.max(1, Math.ceil(matches.length / size));
  const index = Math.max(0, Math.min(pageCount - 1, requested));
  const visible = new Set(matches.slice(index * size, (index + 1) * size));
  records.forEach((student) => { student.hidden = !visible.has(student); });
  root.querySelector('[data-student-empty]').hidden = matches.length > 0;
  const nav = root.querySelector('[data-student-navigation]');
  nav.dataset.page = index;
  nav.hidden = pageCount < 2;
  nav.querySelector('[data-student-page-label]').textContent = `Página ${index + 1} de ${pageCount}`;
  nav.querySelector('[data-student-page="-1"]').disabled = index === 0;
  nav.querySelector('[data-student-page="1"]').disabled = index === pageCount - 1;
}

async function copyInvitation(button) {
  const link = button.dataset.copyLink;
  const url = new URL(window.location.href);
  if (link) {
    url.search = '';
    url.hash = `groups/${part(link)}`;
  }
  const content = link ? url.href : button.dataset.copyCode;
  const statusText = button.closest('.view-card').querySelector('[data-copy-status]');
  statusText.hidden = false;
  try {
    await navigator.clipboard.writeText(content);
    statusText.textContent = link ? 'Link copiado.' : 'Código copiado.';
  } catch {
    const input = document.createElement('input');
    input.value = content;
    input.readOnly = true;
    input.className = 'view-copy-input';
    input.setAttribute('aria-label', link ? 'Link de convite' : 'Código de convite');
    statusText.replaceChildren('Copie o texto selecionado. ', input);
    input.focus();
    input.select();
  }
}

function localClick(event, root) {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.matches('[data-add-exercise]')) {
    const entries = button.closest('details').querySelector('[data-workout-entries]');
    if (entries.children.length >= 50) return;
    const entry = appendMarkup(entries, exerciseCard({ type: button.dataset.addExercise }));
    syncRemoveSeries(entry);
    entry.querySelector('[data-exercise-name]').focus();
  } else if (button.matches('[data-remove-exercise]')) {
    const details = button.closest('details');
    button.closest('[data-exercise]').remove();
    details.querySelector('[data-add-exercise]').focus();
  } else if (button.matches('[data-add-series]')) {
    const exercise = button.closest('[data-exercise]');
    if (exercise.querySelectorAll('[data-series-row]').length >= 100) return;
    const row = appendMarkup(exercise.querySelector('[data-series]'), seriesRow());
    syncRemoveSeries(exercise);
    row.querySelector('input').focus();
  } else if (button.matches('[data-remove-series]')) {
    const exercise = button.closest('[data-exercise]');
    button.closest('[data-series-row]').remove();
    syncRemoveSeries(exercise);
    exercise.querySelector('[data-add-series]').focus();
  } else if (button.matches('[data-copy-code],[data-copy-link]')) {
    void copyInvitation(button);
  } else if (button.matches('[data-student-page]')) {
    const nav = button.closest('[data-student-navigation]');
    studentPage(root, Number(nav.dataset.page) + Number(button.dataset.studentPage));
  }
}

function localChange(event) {
  const target = event.target;
  if (target.matches('[data-photo-input]')) void previewPhoto(target);
  if (target.matches('[data-workout-mode]')) switchWorkoutMode(target);
  if (target.closest('[data-audience]')) syncAudience(target.closest('[data-audience]'));
  if (target.matches('[data-group-successor]')) {
    const leave = target.closest('.view-card').querySelector('[data-action="group.leave"]');
    if (target.value) leave.dataset.userId = target.value;
    else delete leave.dataset.userId;
  }
}

export function bindView(root) {
  if (!activeViews.has(root)) {
    root.addEventListener('click', (event) => localClick(event, root));
    root.addEventListener('change', localChange);
    root.addEventListener('input', (event) => {
      if (event.target.matches('[data-student-search]')) studentPage(root);
    });
    activeViews.add(root);
  }
  root.querySelectorAll('[data-exercise]:has([data-series])').forEach(syncRemoveSeries);
  studentPage(root);
}

function decimal(value, label, { optional = false, min = 0, max = 1000 } = {}) {
  const normalized = value.trim().replace(',', '.');
  if (!normalized && optional) return undefined;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) throw new Error(`Informe um valor válido para ${label}.`);
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`Informe um valor válido para ${label}.`);
  return number;
}

function assignedSeries(container) {
  const set = rawSeries(container);
  return {
    reps: decimal(set.reps, 'repetições', { min: 1 }),
    load: decimal(set.load, 'carga', { max: 2000 }),
  };
}

function readWorkout(exercise) {
  const name = exercise.querySelector('[data-exercise-name]').value.trim();
  if (!name) throw new Error('Informe o nome do exercício.');
  if (exercise.dataset.type === 'cardio') {
    const minutes = decimal(exercise.querySelector('[data-minutes]').value, 'tempo', { min: .01, max: 1440 });
    const distance = decimal(exercise.querySelector('[data-distance]').value, 'distância', { optional: true });
    return { type: 'cardio', exercise: name, minutes, ...(distance == null ? {} : { distance }) };
  }
  const summary = exercise.querySelector('[data-summary]');
  const sets = summary.disabled
    ? Array.from(exercise.querySelectorAll('[data-series-row]'), assignedSeries)
    : Array.from({ length: Number(summary.querySelector('[data-set-count]').value) }, () => assignedSeries(summary));
  return { type: 'forca', exercise: name, sets };
}

function readGroups(form) {
  const all = form.querySelector('input[name="audience"]:checked')?.value === 'all';
  return Array.from(form.querySelectorAll(all ? '[name="groupIds"]' : '[name="groupIds"]:checked'), (input) => input.value);
}

async function formImage(form) {
  const uploader = form.querySelector('[data-uploader]');
  const file = photoSelections.get(uploader) ?? [...(uploader?.querySelectorAll('[data-photo-input]') ?? [])]
    .map((input) => input.files[0]).find(Boolean);
  return file ? imageData(file) : undefined;
}

export async function parseViewForm(form) {
  const operation = form.dataset.form;
  if (operation === 'post.create' || operation === 'post.update') {
    const shareWorkout = form.elements.shareWorkout.checked;
    const workout = Array.from(form.querySelectorAll('[data-exercise]'), readWorkout);
    const groupIds = readGroups(form);
    if (operation === 'post.update') return { id: form.elements.id.value, groupIds, shareWorkout, workout };
    if (window.matchMedia('(min-width: 1024px)').matches) {
      throw new Error('Check-ins são feitos pelo celular, direto da academia.');
    }
    const photo = await formImage(form);
    if (!photo) throw new Error('Escolha uma foto para publicar seu check-in.');
    if (!postRequests.has(form)) postRequests.set(form, crypto.randomUUID());
    return { photo, groupIds, shareWorkout, workout, mobile: true, requestId: postRequests.get(form) };
  }
  if (operation === 'profile.update') {
    const avatar = await formImage(form);
    const share = form.elements.shareWorkout;
    return {
      name: form.elements.name.value.trim(),
      ...(avatar ? { avatar } : {}),
      ...(share ? { shareWorkout: share.checked } : {}),
    };
  }
  if (operation === 'student.invite' || operation === 'student.update') {
    const values = Object.fromEntries(new FormData(form));
    const guardian = form.elements.guardian;
    return { ...values, guardian: guardian.type === 'hidden' ? guardian.value === 'true' : guardian.checked };
  }
  return undefined;
}
