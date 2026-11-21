import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

export class RuleError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const groupLimit = 5;
const memberLimit = 15;
const hour = 3_600_000;
const day = 24 * hour;
const photoLimit = 6 * 1024 * 1024;
const fortaleza = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
});
const baseExercises = [
  { id: 'base-agachamento', exercise: 'Agachamento', type: 'forca' },
  { id: 'base-supino', exercise: 'Supino reto', type: 'forca' },
  { id: 'base-remada', exercise: 'Remada baixa', type: 'forca' },
  { id: 'base-legpress', exercise: 'Leg press', type: 'forca' },
  { id: 'base-corrida', exercise: 'Corrida', type: 'cardio' },
  { id: 'base-bike', exercise: 'Bicicleta ergométrica', type: 'cardio' },
];

function check(condition, message, status = 400) {
  if (!condition) throw new RuleError(message, status);
}

function safeUser(data, id) {
  return data.users.find(user => user.id === id && user.active && user.activated);
}

function normalized(value, label, max) {
  const result = typeof value === 'string' ? value.trim() : '';
  check(result && Array.from(result).length <= max, `${label} deve ter entre 1 e ${max} caracteres.`);
  return result;
}

function emailOf(value) {
  const email = normalized(value, 'O e-mail', 254).toLowerCase();
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Informe um e-mail válido.');
  return email;
}

function dateStamp(timestamp = Date.now()) {
  const parts = fortaleza.formatToParts(timestamp);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function minor(birthDate) {
  if (!birthDate) return false;
  const today = dateStamp();
  const minAdultDate = `${Number(today.slice(0, 4)) - 18}${today.slice(4)}`;
  return birthDate > minAdultDate;
}

function validateBirthDate(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Informe a data de nascimento.');
  const parsed = new Date(`${value}T00:00:00Z`);
  check(Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value <= dateStamp() && value >= '1900-01-01', 'Informe uma data de nascimento válida.');
  return value;
}

function passwordHash(value, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}

function passwordMatches(value, stored) {
  if (typeof value !== 'string' || value.length > 128 || !stored) return false;
  const candidate = passwordHash(value, stored.split(':')[0]);
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(stored));
}

function validatePassword(value) {
  check(typeof value === 'string' && value.length >= 8 && value.length <= 128, 'A senha precisa ter entre 8 e 128 caracteres.');
  return value;
}

function getGroup(data, groupId) {
  const group = data.groups.find(entry => entry.id === groupId && !entry.archived);
  check(group, 'Grupo indisponível.', 404);
  return group;
}

function membership(group, userId) {
  return group.members.find(member => member.userId === userId);
}

function memberOf(data, groupId, userId) {
  const group = data.groups.find(entry => entry.id === groupId && !entry.archived);
  return group && membership(group, userId);
}

function canManage(group, userId) {
  return ['owner', 'admin'].includes(membership(group, userId)?.role);
}

function canSee(data, post, user) {
  if (!user || !post) return false;
  if (post.authorId === user.id) return true;
  return user.role === 'student' && !post.hidden && post.groupIds.some(groupId => memberOf(data, groupId, user.id));
}

function dateEditable(post) {
  return dateStamp(Date.parse(post.createdAt)) === dateStamp();
}

function openReportsFor(data, post, user) {
  if (user?.role !== 'admin' || !post || post.hidden) return [];
  return data.reports.filter(report => report.postId === post.id && report.status === 'pending');
}

function findVisiblePost(data, id, user) {
  const post = data.posts.find(entry => entry.id === id);
  check(canSee(data, post, user), 'Publicação indisponível.', 404);
  return post;
}

function authorPost(data, id, user) {
  const post = findVisiblePost(data, id, user);
  check(post.authorId === user.id, 'Apenas o autor pode alterar a publicação.', 403);
  return post;
}

function membershipsOf(data, userId) {
  return data.groups.filter(group => !group.archived && membership(group, userId));
}

function groupCount(data, userId) {
  return data.groups.filter(group => !group.archived && (membership(group, userId) || group.requests.some(request => request.userId === userId))).length;
}

function invitation(data) {
  const code = randomBytes(5).toString('hex').toUpperCase();
  return data.groups.some(group => group.code === code) ? invitation(data) : code;
}

function moveOwnership(group, successor) {
  const previous = membership(group, group.ownerId);
  if (previous) previous.role = 'admin';
  group.ownerId = successor.userId;
  successor.role = 'owner';
}

function removeMember(group, userId, preferredSuccessor) {
  group.members = group.members.filter(member => member.userId !== userId);
  group.requests = group.requests.filter(request => request.userId !== userId);
  if (group.ownerId !== userId) return;
  if (!group.members.length) {
    group.ownerId = null;
    group.archived = true;
    group.requests = [];
    return;
  }
  const ordered = [...group.members].sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.joinedAt.localeCompare(b.joinedAt) || a.userId.localeCompare(b.userId));
  moveOwnership(group, preferredSuccessor || ordered[0]);
}

function contactCode() {
  return String(randomInt(0, 10 ** 8)).padStart(8, '0');
}

function decodePhoto(source) {
  check(typeof source === 'string', 'Selecione uma foto para o check-in.');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
  check(match, 'Selecione uma foto JPEG, PNG ou WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  check(bytes.length > 12 && bytes.length <= photoLimit, 'A foto precisa ter no máximo 6 MB.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  check((match[1] === 'image/png' && png) || (match[1] === 'image/jpeg' && jpeg) || (match[1] === 'image/webp' && webp), 'O arquivo não corresponde ao formato de imagem informado.');
  return { type: match[1], bytes };
}

function avatarOf(person, viewer, context) {
  if (!person.avatar || !viewer || !context) return null;
  return person.avatar.startsWith('data:') ? `/api/photo/avatar-${person.id}` : person.avatar;
}

function socialUser(person, viewer, sharesGroup) {
  return { id: person.id, name: person.name, avatar: avatarOf(person, viewer, sharesGroup) };
}

function individualUser(person, viewer) {
  return {
    ...socialUser(person, viewer, true), email: person.email, role: person.role, active: person.active,
    activated: person.activated, birthDate: person.birthDate, guardian: person.guardian, minor: minor(person.birthDate),
    shareWorkout: person.shareWorkout,
  };
}

function sharedPeople(data, userId) {
  return new Set(membershipsOf(data, userId).flatMap(group => group.members.map(member => member.userId)));
}

function projectGroup(group, user) {
  const member = membership(group, user.id);
  const pending = group.requests.find(request => request.userId === user.id);
  if (!member && !pending) return null;
  return {
    id: group.id, name: group.name, description: member ? group.description : null, code: member ? group.code : null,
    ownerId: member ? group.ownerId : null, members: member ? group.members.map(({ userId, role }) => ({ userId, role })) : [],
    requests: canManage(group, user.id) ? group.requests.map(({ userId }) => ({ userId })) : pending ? [{ userId: user.id }] : [],
    archived: group.archived,
  };
}

function projectPost(data, post, user, authorProximity) {
  const own = post.authorId === user.id;
  const isStaff = user.role === 'admin';
  const openReports = openReportsFor(data, post, user);
  const maySeePhoto = !isStaff || openReports.some(report => !report.commentId);
  const comments = isStaff ? post.comments.filter(comment => openReports.some(report => report.commentId === comment.id)) : post.comments;
  const workout = !isStaff && (own || post.shareWorkout)
    ? post.workout.map(({ exerciseId, ...entry }) => own ? { ...entry, exerciseId } : entry) : [];
  const elapsedHours = Math.max(0, (Date.now() - Date.parse(post.createdAt)) / hour);
  const score = elapsedHours <= 48 ? (1 + post.likes.length + 2 * post.comments.length + 2 * (authorProximity.get(post.authorId) || 0)) / (elapsedHours + 2) : null;
  return {
    id: post.id, authorId: post.authorId, createdAt: post.createdAt,
    photo: !post.photo || !maySeePhoto ? null : post.photo.startsWith('data:') ? `/api/photo/${post.id}` : post.photo,
    groupIds: post.groupIds.filter(groupId => Boolean(memberOf(data, groupId, user.id))),
    ...(own ? { blockedGroupIds: post.blockedGroupIds.filter(id => memberOf(data, id, user.id)) } : {}),
    shareWorkout: post.shareWorkout,
    workout,
    likes: isStaff ? 0 : post.likes.length, liked: post.likes.some(like => like.userId === user.id),
    ...(own ? { likedBy: post.likes.map(like => like.userId) } : {}),
    comments,
    editable: own && dateEditable(post), hidden: Boolean(post.hidden), score: isStaff ? null : score,
  };
}

const emptyData = () => ({ user: null, users: [], groups: [], posts: [], reports: [], exercises: [] });

export function publicState(data, userId) {
  const user = safeUser(data, userId);
  if (!user) return emptyData();
  const own = individualUser(user, user);
  const isStaff = user.role === 'admin';
  const groups = isStaff ? [] : data.groups.filter(group => !group.archived).map(group => projectGroup(group, user)).filter(Boolean);
  const visible = data.posts.filter(post => canSee(data, post, user) || openReportsFor(data, post, user).length > 0);
  const authorProximity = new Map();
  const proximityStart = Date.now() - 30 * day;
  for (const post of visible) {
    const likes = post.likes.filter(like => like.userId === user.id && Date.parse(like.createdAt) >= proximityStart).length;
    const comments = post.comments.filter(comment => comment.authorId === user.id && Date.parse(comment.createdAt) >= proximityStart).length;
    authorProximity.set(post.authorId, (authorProximity.get(post.authorId) || 0) + likes + comments);
  }
  const posts = visible.map(post => projectPost(data, post, user, authorProximity)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const knownPeople = sharedPeople(data, user.id);
  const people = new Set([user.id, ...knownPeople]);
  for (const group of groups) for (const request of group.requests) people.add(request.userId);
  for (const post of posts) {
    people.add(post.authorId);
    for (const comment of post.comments) people.add(comment.authorId);
    for (const likerId of post.likedBy || []) people.add(likerId);
  }
  const users = isStaff
    ? data.users.map(person => individualUser(person, user))
    : data.users.filter(person => people.has(person.id)).map(person => person.id === user.id ? own : socialUser(person, user, knownPeople.has(person.id)));
  const reports = isStaff ? data.reports : [];
  const exercises = isStaff ? [] : [...baseExercises, ...data.exercises.filter(exercise => exercise.userId === user.id)]
    .map(({ id, exercise, type, userId }) => ({ id, name: exercise, type, custom: Boolean(userId) }));
  return { user: own, users, groups, posts, reports, exercises };
}

export function getPhoto(data, userId, id) {
  const user = safeUser(data, userId);
  if (id.startsWith('avatar-')) {
    const targetId = id.slice(7);
    const person = data.users.find(person => person.id === targetId);
    check(user && person?.avatar?.startsWith('data:') && (user.role === 'admin' || user.id === targetId || sharedPeople(data, user.id).has(targetId)), 'Foto indisponível.', 404);
    return decodePhoto(person.avatar);
  }
  const post = data.posts.find(entry => entry.id === id);
  check(post?.photo?.startsWith('data:') && (canSee(data, post, user) || openReportsFor(data, post, user).some(report => !report.commentId)), 'Foto indisponível.', 404);
  return decodePhoto(post.photo);
}

export function createSeed() {
  const now = Date.now();
  const isoHoursAgo = hours => new Date(now - hours * hour).toISOString();
  const joinedAt = isoHoursAgo(24 * 12);
  const hashed = passwordHash('BeleDemo2026!');
  const makeUser = (id, name, birthDate, role = 'student') => ({
    id, name, email: `${id}@bele.test`, role, active: true, activated: true, birthDate, guardian: false,
    avatar: null, shareWorkout: true, password: hashed, invite: null, reset: null,
  });
  const users = [
    makeUser('marina', 'Marina Costa', '2000-06-18'), makeUser('rafael', 'Rafael Lima', '1997-08-11'),
    makeUser('julia', 'Júlia Alves', '1999-03-20'), makeUser('bruno', 'Bruno Melo', '2002-12-09'),
    makeUser('carol', 'Carol Santos', '2001-04-27'), makeUser('admin', 'Equipe Belê', '1993-05-14', 'admin'),
  ];
  const makeGroup = (id, name, description, code, ownerId, others, requests = []) => ({
    id, name, description, code, ownerId, archived: false,
    members: [{ userId: ownerId, role: 'owner', joinedAt }, ...others.map(([userId, role]) => ({ userId, role, joinedAt }))],
    requests: requests.map(userId => ({ userId, createdAt: isoHoursAgo(9) })),
  });
  const groups = [
    makeGroup('turma18', 'Turma das 18h', 'Para quem treina no fim do dia e gosta de dar força à turma.', 'TURMA18', 'marina', [['julia', 'admin'], ['rafael', 'member'], ['bruno', 'member']], ['carol']),
    makeGroup('constancia', 'Projeto Constância', 'Um treino de cada vez. Compartilhe seu check-in com o grupo.', 'CONSTA26', 'rafael', [['marina', 'member'], ['julia', 'member']]),
    makeGroup('cardio', 'Clube do Cardio', 'Corrida, caminhada, pedal e qualquer jeito de se movimentar.', 'CARDIO26', 'bruno', [['marina', 'member'], ['carol', 'member']]),
  ];
  const strength = (exercise, reps, load, times) => ({ type: 'forca', exercise, sets: Array.from({ length: times }, () => ({ reps, load })) });
  const basePost = (id, authorId, age, groupIds, workout) => ({
    id, authorId, createdAt: isoHoursAgo(age), photo: '/assets/treino-demo.webp', groupIds, workout, shareWorkout: true,
    hidden: false, blockedGroupIds: [], likes: [], comments: [],
  });
  const lead = basePost('checkin-julia', 'julia', 2, ['turma18', 'constancia'], [strength('Agachamento', 10, 35, 4), strength('Leg press', 12, 65, 3)]);
  lead.likes = ['marina', 'rafael', 'bruno', 'carol'].map(userId => ({ userId, createdAt: isoHoursAgo(1.5) }));
  lead.comments = [{ id: 'seed-comentario-1', authorId: 'rafael', text: 'Boa, Júlia! Amanhã tem mais 🙌', createdAt: isoHoursAgo(1.1) }, { id: 'seed-comentario-2', authorId: 'bruno', text: 'Turma das 18h presente!', createdAt: isoHoursAgo(0.8) }];
  const own = basePost('checkin-marina', 'marina', 8, ['turma18'], [strength('Remada baixa', 12, 25, 3)]);
  own.likes = [{ userId: 'julia', createdAt: isoHoursAgo(5) }, { userId: 'rafael', createdAt: isoHoursAgo(4) }];
  const privatePost = basePost('checkin-privado', 'marina', 60, [], [{ type: 'cardio', exercise: 'Bicicleta ergométrica', minutes: 20, distance: null }]);
  privatePost.shareWorkout = false;
  const second = basePost('checkin-rafael', 'rafael', 26, ['constancia'], [strength('Supino reto', 10, 40, 3)]);
  const third = basePost('checkin-bruno', 'bruno', 46, ['cardio'], [{ type: 'cardio', exercise: 'Corrida', minutes: 32, distance: 5 }]);
  const reports = [{ id: 'seed-denuncia-1', postId: second.id, commentId: null, targetType: 'post', authorId: 'julia', reason: 'Revisão de exemplo para demonstrar a fila da academia.', createdAt: isoHoursAgo(21), status: 'pending' }];
  return { users, groups, posts: [lead, own, privatePost, second, third], reports, sessions: {}, exercises: [] };
}

const now = () => new Date().toISOString();
const success = (message, extras = {}) => ({ ok: true, ...(message ? { message } : {}), ...extras });

function authAction(data, request) {
  const { action, role } = request;
  if (action === 'logout') return success(null, { sessionUser: null });
  if (action === 'demo') {
    check(['student', 'admin'].includes(role), 'Escolha uma conta de demonstração.');
    const user = safeUser(data, role === 'admin' ? 'admin' : 'marina');
    check(user, 'Esta conta de demonstração está desativada.');
    return success(null, { sessionUser: user.id });
  }

  const email = emailOf(request.email);
  const user = data.users.find(person => person.email === email);
  if (action === 'login') {
    check(user?.active && user.activated && passwordMatches(request.password, user.password), 'E-mail ou senha inválidos, ou conta sem acesso.', 401);
    return success(null, { sessionUser: user.id });
  }

  if (action === 'recover') {
    if (!user?.active || !user.activated) return success('Se a conta estiver habilitada, você poderá recuperar sua senha.');
    const code = contactCode();
    user.reset = { code, expiresAt: Date.now() + hour };
    return success('Código disponível nesta demonstração local.', { code });
  }

  const activating = action === 'activate';
  const field = activating ? 'invite' : 'reset';
  const code = String(request.code || '').trim();
  const eligible = activating ? !user?.activated : user?.activated;
  check(user?.active && eligible && user[field]?.code === code && user[field].expiresAt > Date.now(), 'Código inválido ou vencido.');
  check(!activating || !minor(user.birthDate) || user.guardian, 'A academia precisa registrar a autorização do responsável antes de liberar o acesso.', 403);
  user.password = passwordHash(validatePassword(request.password));
  user[field] = null;
  user.activated = true;
  for (const [key, session] of Object.entries(data.sessions)) if (session.userId === user.id) delete data.sessions[key];
  return success(activating ? 'Conta ativada.' : 'Senha redefinida.', { sessionUser: user.id });
}

function groupAction(data, user, request) {
  const { action, id, userId } = request;
  if (action === 'group.create') {
    check(groupCount(data, user.id) < groupLimit, 'Você já ocupa os cinco lugares entre grupos e pedidos.');
    const group = {
      id: randomUUID(), name: normalized(request.name, 'O nome do grupo', 70),
      description: String(request.description ?? '').trim().slice(0, 280), code: invitation(data), ownerId: user.id,
      archived: false, members: [{ userId: user.id, role: 'owner', joinedAt: now() }], requests: [],
    };
    data.groups.push(group);
    return success('Grupo criado.', { id: group.id });
  }

  if (action === 'group.join') {
    const code = normalized(request.code, 'O código', 120).toUpperCase();
    const group = data.groups.find(entry => !entry.archived && entry.code === code);
    check(group, 'Código de convite inválido.', 404);
    if (membership(group, user.id)) return success('Você já participa deste grupo.', { id: group.id });
    if (group.requests.some(entry => entry.userId === user.id)) return success('Seu pedido já está aguardando aprovação.', { id: group.id });
    check(groupCount(data, user.id) < groupLimit, 'Você já ocupa os cinco lugares entre grupos e pedidos.');
    check(group.members.length < memberLimit, 'Este grupo está cheio no momento.');
    group.requests.push({ userId: user.id, createdAt: now() });
    return success('Pedido de entrada enviado.', { id: group.id });
  }

  const group = getGroup(data, id);
  if (action === 'group.cancel') {
    check(group.requests.some(entry => entry.userId === user.id), 'Pedido indisponível.', 404);
    group.requests = group.requests.filter(entry => entry.userId !== user.id);
    return success('Pedido cancelado.');
  }

  const me = membership(group, user.id);
  check(me, 'Grupo indisponível.', 404);
  if (action === 'group.leave') {
    const chosen = userId && membership(group, userId);
    check(!userId || (me.role === 'owner' && chosen && userId !== user.id), 'Escolha outro participante do grupo como sucessor.');
    removeMember(group, user.id, chosen);
    return success('Você saiu do grupo.');
  }

  check(canManage(group, user.id), 'Você não pode administrar este grupo.', 403);
  if (action === 'group.review') {
    const waiting = group.requests.some(entry => entry.userId === userId);
    check(waiting, 'Pedido indisponível.', 404);
    check(typeof request.approved === 'boolean', 'Escolha aprovar ou recusar o pedido.');
    if (request.approved) {
      check(safeUser(data, userId)?.role === 'student', 'A conta do aluno está indisponível.', 409);
      check(group.members.length < memberLimit, 'Este grupo está cheio no momento.', 409);
      check(groupCount(data, userId) <= groupLimit, 'O aluno já atingiu o limite de grupos.', 409);
      group.members.push({ userId, role: 'member', joinedAt: now() });
    }
    group.requests = group.requests.filter(entry => entry.userId !== userId);
    return success(request.approved ? 'Entrada aprovada.' : 'Pedido recusado.');
  }

  if (action === 'group.renew') {
    check(me.role === 'owner', 'Apenas o dono pode renovar o código.', 403);
    group.code = invitation(data);
    return success('Código renovado.', { code: group.code });
  }

  const member = membership(group, userId);
  check(member && member.role !== 'owner', 'Escolha outro participante do grupo.', 404);
  if (action === 'group.transfer') {
    check(me.role === 'owner', 'Apenas o dono pode transferir a posse.', 403);
    moveOwnership(group, member);
    return success('Posse transferida.');
  }

  check(action === 'group.member' && ['remove', 'promote', 'demote'].includes(request.operation), 'Ação de grupo inválida.');
  if (request.operation === 'remove') {
    check(me.role === 'owner' || member.role === 'member', 'Você não pode remover este participante.', 403);
    removeMember(group, userId);
    return success('Participante removido.');
  }

  check(me.role === 'owner', 'Apenas o dono pode alterar papéis.', 403);
  member.role = request.operation === 'promote' ? 'admin' : 'member';
  return success('Papel atualizado.');
}

function validAudience(data, user, groupIds, blocked = []) {
  check(Array.isArray(groupIds) && groupIds.length <= groupLimit, 'Selecione grupos válidos.');
  const available = new Set(membershipsOf(data, user.id).map(group => group.id));
  check(groupIds.every(id => available.has(id)), 'Você precisa participar dos grupos selecionados.', 403);
  check(groupIds.every(id => !blocked.includes(id)), 'Este check-in foi retirado de um dos grupos selecionados.', 409);
  return [...new Set(groupIds)];
}

function numberInRange(value, min, max, integer = false) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
}

function cleanWorkout(data, user, entries) {
  check(Array.isArray(entries) && entries.length <= 50, 'Inclua até 50 exercícios por treino.');
  const available = [...baseExercises, ...data.exercises.filter(item => item.userId === user.id)];
  return entries.map(entry => {
    check(entry && ['forca', 'cardio'].includes(entry.type), 'Escolha força ou cardio para cada exercício.');
    const exercise = normalized(entry.exercise, 'O nome do exercício', 100);
    let exerciseId = available.find(item => item.exercise === exercise && item.type === entry.type)?.id ?? null;
    if (entry.exerciseId) {
      const match = available.find(item => item.id === entry.exerciseId);
      check(match && match.exercise === exercise && match.type === entry.type, 'Exercício indisponível.');
      exerciseId = match.id;
    }
    if (entry.type === 'cardio') {
      check(entry.sets == null && numberInRange(entry.minutes, 0.01, 1440), 'Informe a duração do cardio em minutos.');
      check(entry.distance == null || numberInRange(entry.distance, 0, 1000), 'Informe uma distância válida em quilômetros.');
      return { type: 'cardio', exercise, exerciseId, minutes: entry.minutes, distance: entry.distance ?? null };
    }
    check(entry.minutes == null && entry.distance == null && Array.isArray(entry.sets) && entry.sets.length > 0 && entry.sets.length <= 100, 'Inclua de 1 a 100 séries por exercício de força.');
    const sets = entry.sets.map(set => {
      check(numberInRange(set?.reps, 1, 1000, true) && numberInRange(set?.load, 0, 2000), 'Informe repetições inteiras e carga maior ou igual a zero.');
      return { reps: set.reps, load: set.load };
    });
    return { type: 'forca', exercise, exerciseId, sets };
  });
}

function sendReport(data, user, request, post, commentId = null) {
  if (data.reports.some(report => report.authorId === user.id && report.postId === post.id && report.commentId === commentId)) return success('Sua denúncia já foi encaminhada.');
  const reason = normalized(request.reason, 'O motivo', 500);
  data.reports.push({
    id: randomUUID(), postId: post.id, commentId, targetType: commentId ? 'comment' : 'post',
    authorId: user.id, reason, createdAt: now(), status: 'pending',
  });
  return success('Denúncia encaminhada à academia.');
}

function endReports(data, predicate, status, userId) {
  for (const report of data.reports) {
    if (report.status === 'pending' && predicate(report)) {
      report.status = status;
      report.reviewedAt = now();
      report.reviewedBy = userId;
    }
  }
}

function postAction(data, user, request) {
  const { action, id } = request;
  if (action === 'post.create') {
    const requestKey = typeof request.requestId === 'string' && request.requestId.length <= 100 ? request.requestId : null;
    const previous = requestKey && data.posts.find(post => post.authorId === user.id && post.requestKey === requestKey);
    if (previous) return success('Check-in registrado.', { id: previous.id });
    decodePhoto(request.photo);
    const groupIds = validAudience(data, user, request.groupIds ?? []);
    const workout = cleanWorkout(data, user, request.workout ?? []);
    const post = {
      id: randomUUID(), authorId: user.id, createdAt: now(), photo: request.photo, groupIds, workout,
      shareWorkout: typeof request.shareWorkout === 'boolean' ? request.shareWorkout : user.shareWorkout,
      hidden: false, blockedGroupIds: [], likes: [], comments: [], requestKey,
    };
    data.posts.push(post);
    user.shareWorkout = post.shareWorkout;
    return success('Check-in registrado.', { id: post.id });
  }

  if (action === 'comment.delete' || action === 'comment.report') {
    const post = data.posts.find(post => post.comments.some(comment => comment.id === id));
    check(post && !post.hidden && canSee(data, post, user), 'Comentário indisponível.', 404);
    if (action === 'comment.report') return sendReport(data, user, request, post, id);
    check(post.authorId === user.id || post.comments.some(comment => comment.id === id && comment.authorId === user.id), 'Você não pode excluir este comentário.', 403);
    post.comments = post.comments.filter(comment => comment.id !== id);
    endReports(data, report => report.commentId === id, 'removed', user.id);
    return success('Comentário excluído.');
  }

  if (action === 'post.update' || action === 'post.delete') {
    const post = authorPost(data, id, user);
    if (action === 'post.delete') {
      data.posts = data.posts.filter(entry => entry.id !== id);
      endReports(data, report => report.postId === id, 'removed', user.id);
      return success('Check-in excluído.');
    }
    check(dateEditable(post), 'O prazo para editar este check-in terminou.', 409);
    if (request.groupIds !== undefined) {
      check(!post.hidden || (Array.isArray(request.groupIds) && request.groupIds.length === 0), 'Uma publicação retirada pela academia não pode voltar ao feed.', 409);
      if (!post.hidden) {
        const unavailable = post.groupIds.filter(groupId => !memberOf(data, groupId, user.id));
        post.groupIds = [...unavailable, ...validAudience(data, user, request.groupIds, post.blockedGroupIds)];
      }
    }
    if (request.workout !== undefined) post.workout = cleanWorkout(data, user, request.workout);
    if (typeof request.shareWorkout === 'boolean') post.shareWorkout = request.shareWorkout;
    return success('Check-in atualizado.');
  }

  const post = findVisiblePost(data, id, user);
  check(!post.hidden, 'Publicação indisponível.', 404);
  if (action === 'post.removeGroup') {
    const group = getGroup(data, request.groupId);
    check(canManage(group, user.id), 'Você não administra este grupo.', 403);
    if (post.blockedGroupIds.includes(group.id)) return success('Check-in retirado do grupo.');
    check(post.groupIds.includes(group.id), 'Este check-in não pertence ao grupo.', 409);
    post.groupIds = post.groupIds.filter(id => id !== group.id);
    post.blockedGroupIds.push(group.id);
    return success('Check-in retirado do grupo.');
  }

  check(post.groupIds.some(groupId => memberOf(data, groupId, user.id)), 'As interações estão disponíveis em check-ins compartilhados.');
  if (action === 'post.like') {
    const alreadyLiked = post.likes.some(like => like.userId === user.id);
    const wanted = typeof request.liked === 'boolean' ? request.liked : !alreadyLiked;
    if (wanted && !alreadyLiked) post.likes.push({ userId: user.id, createdAt: now() });
    if (!wanted && alreadyLiked) post.likes = post.likes.filter(like => like.userId !== user.id);
    return success();
  }

  if (action === 'post.comment') {
    post.comments.push({ id: randomUUID(), authorId: user.id, text: normalized(request.text, 'O comentário', 500), createdAt: now() });
    return success('Comentário publicado.');
  }
  check(action === 'post.report', 'Ação de publicação inválida.');
  return sendReport(data, user, request, post);
}

function studentAction(data, user, request) {
  if (request.action === 'student.invite') {
    const email = emailOf(request.email);
    const existing = data.users.find(person => person.email === email);
    if (existing?.role === 'student' && !existing.activated && existing.active) {
      const code = contactCode();
      existing.invite = { code, expiresAt: Date.now() + 7 * day };
      return success('Convite local renovado.', { code, id: existing.id });
    }
    check(!existing, 'Esse e-mail já está cadastrado.', 409);
    const birthDate = validateBirthDate(request.birthDate);
    const code = contactCode();
    const guardian = request.guardian === true;
    const person = {
      id: randomUUID(), name: normalized(request.name, 'O nome', 100), email, birthDate, guardian,
      avatar: null, shareWorkout: true, role: 'student', active: true, activated: false, password: null,
      invite: { code, expiresAt: Date.now() + 7 * day }, reset: null,
      ...(guardian ? { guardianRecordedAt: now(), guardianRecordedBy: user.id } : {}),
    };
    data.users.push(person);
    return success('Aluno pré-cadastrado. O código fica disponível nesta demonstração local.', { code, id: person.id });
  }

  const person = data.users.find(person => person.id === request.id && person.role === 'student');
  check(person, 'Aluno indisponível.', 404);
  if (request.action === 'student.update') {
    // A data de nascimento é imutável após o pré-cadastro. Nunca aceite birthDate
    // nesta operação, mesmo que um cliente antigo tente enviá-la.
    check(request.guardian === true || request.guardian === false, 'Selecione uma autorização válida.');
    check(!person.activated || !minor(person.birthDate) || person.guardian || request.guardian === true, 'Registre a autorização do responsável antes de atualizar uma conta ativa de menor.');
    if (request.guardian === true && !person.guardian) {
      person.guardian = true;
      person.guardianRecordedAt = now();
      person.guardianRecordedBy = user.id;
    }
    return success('Autorização atualizada. A data de nascimento permanece bloqueada.');
  }

  check(request.action === 'student.active' && typeof request.active === 'boolean', 'Selecione um status válido.');
  if (request.active) {
    check(!minor(person.birthDate) || person.guardian, 'Registre a autorização do responsável antes de reativar a conta.');
    person.active = true;
    return success('Acesso habilitado.');
  }
  person.active = false;
  person.reset = null;
  for (const [key, session] of Object.entries(data.sessions)) if (session.userId === person.id) delete data.sessions[key];
  for (const group of data.groups.filter(group => !group.archived)) removeMember(group, person.id);
  return success('Acesso desativado.');
}

function reviewReport(data, user, request) {
  const report = data.reports.find(entry => entry.id === request.id);
  check(report, 'Denúncia indisponível.', 404);
  if (report.status !== 'pending') return success('Esta denúncia já foi analisada.');
  check(typeof request.remove === 'boolean', 'Escolha descartar a denúncia ou remover o conteúdo.');
  if (!request.remove) {
    endReports(data, entry => entry.id === report.id, 'dismissed', user.id);
    return success('Denúncia descartada.');
  }

  const post = data.posts.find(entry => entry.id === report.postId);
  if (report.commentId) {
    if (post) post.comments = post.comments.filter(comment => comment.id !== report.commentId);
    endReports(data, entry => entry.commentId === report.commentId, 'removed', user.id);
    return success('Comentário retirado.');
  }

  if (post) {
    post.photo = null;
    post.groupIds = [];
    post.hidden = true;
    post.likes = [];
    post.comments = [];
  }
  endReports(data, entry => entry.postId === report.postId, 'removed', user.id);
  return success('Publicação retirada. O treino foi preservado.');
}

function exerciseAction(data, user, request) {
  const exercise = data.exercises.find(item => item.id === request.id && item.userId === user.id);
  if (request.action !== 'exercise.create') check(exercise, 'Exercício indisponível.', 404);
  const used = exercise && data.posts.some(post => post.authorId === user.id && post.workout.some(item => item.exerciseId === exercise.id));
  check(!used, 'Esse exercício já está vinculado a um treino.');
  if (request.action === 'exercise.delete') {
    data.exercises = data.exercises.filter(item => item.id !== exercise.id);
    return success('Exercício excluído.');
  }
  check(['exercise.create', 'exercise.update'].includes(request.action) && ['forca', 'cardio'].includes(request.type), 'Informe se o exercício é de força ou cardio.');
  const name = normalized(request.exercise ?? request.name, 'O nome do exercício', 100).replace(/\s+/g, ' ');
  const key = name.toLocaleLowerCase('pt-BR');
  check(!data.exercises.some(item => item.userId === user.id && item.id !== exercise?.id && item.exercise.toLocaleLowerCase('pt-BR') === key), 'Você já tem um exercício com esse nome.');
  if (exercise) {
    exercise.exercise = name;
    exercise.type = request.type;
    return success('Exercício atualizado.', { id: exercise.id });
  }
  const item = { id: randomUUID(), exercise: name, type: request.type, userId: user.id };
  data.exercises.push(item);
  return success('Exercício criado.', { id: item.id });
}

export function applyAction(data, userId, request) {
  const action = request.action;
  check(typeof action === 'string', 'Ação inválida.');
  if (['demo', 'login', 'logout', 'activate', 'recover', 'reset'].includes(action)) return authAction(data, request);
  const user = safeUser(data, userId);
  check(user, 'Entre na sua conta para continuar.', 401);

  if (action.startsWith('student.') || action === 'report.review') {
    check(user.role === 'admin', 'Apenas a equipe da academia pode fazer isso.', 403);
    return action === 'report.review' ? reviewReport(data, user, request) : studentAction(data, user, request);
  }

  if (action === 'profile.update') {
    if (request.name !== undefined) user.name = normalized(request.name, 'O nome', 100);
    if (request.avatar !== undefined) {
      if (request.avatar !== null && request.avatar !== '') decodePhoto(request.avatar);
      user.avatar = request.avatar || null;
    }
    if (typeof request.shareWorkout === 'boolean') user.shareWorkout = request.shareWorkout;
    return success('Perfil atualizado.');
  }

  check(user.role === 'student', 'Esta ação está disponível para alunos.', 403);
  if (action.startsWith('group.')) return groupAction(data, user, request);
  if (action.startsWith('post.') || action.startsWith('comment.')) return postAction(data, user, request);
  if (action.startsWith('exercise.')) return exerciseAction(data, user, request);
  throw new RuleError('Ação desconhecida.', 404);
}
