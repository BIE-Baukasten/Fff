// German labels for internal contents and an interpretive "mind reader".
// IMPORTANT: this is the interface translating measurable internal state into
// words for the human observer. The organism itself only speaks the words it
// has learned (see lexicon.js).
import { NEED_LABEL } from './config.js';

const SENSE = { food: 'Futtergeruch', water: 'Wassergeruch', shelter: 'die Höhle', thorn: 'Dornen', toy: 'etwas Bewegliches', user: 'dich' };
const CUE = { ton: 'ein Glockenton', licht: 'ein Lichtsignal', summen: 'ein Summen', duft: 'ein Duft' };
const GOAL = { food: 'zu Futter', water: 'zum Wasser', shelter: 'zur Höhle', explore: 'Unbekanntes erkunden' };
const ACT = { gehen: 'gehen', essen: 'essen', trinken: 'trinken', spielen: 'spielen', nehmen: 'zugreifen', warten: 'warten', schlafen: 'schlafen', rufen: 'rufen' };

export function keyLabel(key, info) {
  if (!key) return '';
  const [kind, rest] = key.split(/:(.*)/s);
  switch (kind) {
    case 'need': return (rest === 'temp' ? 'Temperatur' : NEED_LABEL[rest] || rest) + '-Mangel';
    case 'pain': return 'Schmerz';
    case 'sense': return 'wittert ' + (SENSE[rest] || rest);
    case 'obj': return { berry: 'Beere vor sich', futter: 'Futter vor sich', toy: 'Spielding', wasser: 'Wasser hier' }[rest] || rest;
    case 'cue': return CUE[rest] || rest;
    case 'word': return `Wort »${rest}«`;
    case 'touch': return 'Berührung';
    case 'taste': return 'Geschmack' + (info?.label ? ` (${info.label})` : '');
    case 'surprise': return 'Überraschung';
    case 'act': return 'eigenes Tun: ' + (ACT[rest] || rest);
    case 'mem': return 'Erinnerung' + (info?.data ? ` (${episodeLabel(info.data)})` : '');
    case 'goal': return 'Plan: ' + (GOAL[rest] || rest);
    case 'unsicher': return 'Unsicherheit';
    default: return key;
  }
}

export function episodeLabel(ep) {
  const e = ep?.event || {};
  const m = { eat: e.item === 'pellet' ? 'Futter gefressen' : 'Beere gegessen', nausea: 'Übelkeit', hurt: 'verletzt', play: 'gespielt', stroke: 'gestreichelt', poke: 'angestupst', word: `»${(e.words || []).join(' ')}« gehört`, drink: 'getrunken', notice: 'etwas bemerkt', collapse: 'erschöpft eingeschlafen' };
  return m[e.type] || 'Moment';
}

export function emotion(s) {
  if (!s.alive) return { label: 'tot', tone: 'dead' };
  if (s.sleeping) return { label: s.contents.some(c => c.key.startsWith('mem:')) ? 'träumt' : 'schläft', tone: 'calm' };
  const h = s.h, v = s.affect.valence, ar = s.affect.arousal;
  if (s.pain > 0.3) return { label: 'hat Schmerzen', tone: 'bad' };
  const urg = k => (k === 'temp' ? Math.abs(h.temp - 0.5) * 2.5 : Math.max(0, (({ energy: 0.8, water: 0.8, rest: 0.85, social: 0.7, curiosity: 0.7, integrity: 1 })[k] - h[k]) / ({ energy: 0.8, water: 0.8, rest: 0.85, social: 0.7, curiosity: 0.7, integrity: 1 })[k]));
  const top = ['energy', 'water', 'temp', 'rest', 'social', 'curiosity'].map(k => [k, urg(k)]).sort((a, b) => b[1] - a[1])[0];
  if (s.contents.some(c => c.key === 'surprise')) return { label: 'überrascht', tone: 'alert' };
  if (top[1] > 0.55) return { label: { energy: 'hungrig', water: 'durstig', temp: h.temp < 0.5 ? 'friert' : 'ist zu warm', rest: 'müde', social: 'sehnt sich nach Nähe', curiosity: 'gelangweilt' }[top[0]], tone: 'need' };
  if (s.contents.some(c => c.key === 'touch') && v > 0) return { label: 'genießt die Berührung', tone: 'good' };
  if (s.contents.some(c => c.key === 'obj:toy' || c.key === 'sense:toy') && h.curiosity < 0.7) return { label: 'neugierig', tone: 'good' };
  if (s.contents.some(c => c.key === 'unsicher')) return { label: 'zögert', tone: 'alert' };
  if (v > 0.25) return { label: ar > 0.4 ? 'freudig erregt' : 'zufrieden', tone: 'good' };
  if (v < -0.25) return { label: ar > 0.4 ? 'aufgewühlt' : 'missmutig', tone: 'bad' };
  return { label: ar < 0.25 ? 'entspannt' : 'wach', tone: 'calm' };
}

/** Interpretive first-person rendering of the current workspace (for observers). */
export function mindReader(s, lexicon) {
  if (!s.alive) return [`${s.name} lebt nicht mehr (${s.cause}).`];
  const out = [];
  const cs = s.contents;
  if (s.sleeping) {
    const dream = cs.find(c => c.key.startsWith('mem:'));
    out.push(dream ? `Im Traum taucht eine Erinnerung auf: ${keyLabel(dream.key, { data: dreamData(s, dream.key) }).replace('Erinnerung ', '')}.` : 'Tiefer Schlaf. Kaum etwas erreicht den Arbeitsraum.');
    return out;
  }
  if (!cs.length) out.push('Gerade ist nichts im Vordergrund – der Arbeitsraum ist still.');
  for (const c of cs.slice(0, 4)) {
    const k = c.key;
    if (k.startsWith('need:')) {
      const n = k.slice(5);
      out.push({ energy: 'Ich habe Hunger.', water: 'Ich habe Durst.', temp: s.h.temp < 0.5 ? 'Mir ist kalt.' : 'Mir ist zu warm.', rest: 'Ich bin müde.', social: 'Ich wäre gern bei jemandem.', curiosity: 'Mir ist langweilig.', integrity: 'Mein Körper ist verletzt.' }[n]);
    } else if (k === 'pain') out.push('Es tut weh.');
    else if (k === 'obj:berry' && s.berry) {
      const p = s.berry.p, conf = s.berry.conf;
      const judg = p > 0.6 ? 'sieht bekömmlich aus' : p < 0.4 ? 'sieht nach der giftigen Sorte aus' : 'ist schwer einzuschätzen';
      out.push(`Eine Beere – sie ${judg}${conf != null ? ` (Zuversicht ${Math.round(conf * 100)} %)` : ''}.`);
    } else if (k === 'unsicher') out.push('Ich bin mir nicht sicher.');
    else if (k.startsWith('goal:')) out.push({ food: 'Ich weiß, wo es Futter gibt – dorthin.', water: 'Ich erinnere mich, wo Wasser ist.', shelter: 'Ich will zur Höhle.', explore: 'Dort hinten war ich noch nie.' }[k.slice(5)]);
    else if (k.startsWith('sense:')) out.push({ food: 'Da riecht es nach Futter.', water: 'Ich rieche Wasser.', shelter: 'Die Höhle ist nah.', thorn: 'Vorsicht, Dornen.', toy: 'Da bewegt sich etwas!', user: 'Du bist da.' }[k.slice(6)]);
    else if (k.startsWith('cue:')) {
      const m = s.V > 0.2 ? ' Gleich gibt es etwas Gutes!' : '';
      out.push(`Ich höre/sehe ${keyLabel(k)}.${m}`);
    } else if (k.startsWith('word:')) {
      const w = k.slice(5); const mean = lexicon?.meaning(w, 1)[0];
      out.push(mean && mean[1] > 0.2 ? `»${w}« – das hat mit ${keyLabel(mean[0])} zu tun.` : `»${w}«? Das Wort kenne ich noch nicht gut.`);
    } else if (k === 'touch') out.push('Du berührst mich.');
    else if (k === 'taste') out.push('Das schmeckt.');
    else if (k === 'surprise') out.push('Huch – das hatte ich nicht erwartet.');
    else if (k.startsWith('mem:')) out.push(`Mir fällt etwas ein: ${keyLabel(k, { data: dreamData(s, k) }).replace('Erinnerung ', '').replace(/^\(|\)$/g, '')}.`);
    else if (k === 'obj:toy') out.push('Ein Spielding! Anstupsen?');
    else if (k === 'obj:futter') out.push('Futter direkt vor mir.');
    else if (k === 'obj:wasser') out.push('Hier kann ich trinken.');
  }
  if (s.ast?.drift) out.push('(Meine Gedanken schweifen ab – zurück zur Sache.)');
  return out.filter(Boolean);
}
function dreamData(s, key) { return s._episodes?.get?.(+key.slice(4)); }
