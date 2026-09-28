const CATEGORIES = [
  { key: 'definitions', label: 'Definitions', color: '#3d8268' },
  { key: 'laws_principles', label: 'Laws / Principles', color: '#e4a15f' },
  { key: 'derivations', label: 'Derivations', color: '#7388bb' },
  { key: 'formulas', label: 'Formulas', color: '#d97864' },
  { key: 'concepts', label: 'Concepts', color: '#65a9a8' },
  { key: 'graphs', label: 'Graphs', color: '#a987be' },
  { key: 'applications', label: 'Applications', color: '#b6a14e' },
  { key: 'related_concepts', label: 'Related Concepts', color: '#7d9780' },
];
const DATA_URL = '../data/database_A/database_A.json';
const svgNS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const workspace = $('workspace');
const chartDock = $('chartDock');
const pieChart = $('pieChart');
const chapterList = $('chapterList');
const detailPanel = $('detailPanel');
let database = null;
let chapters = [];
let currentChapter = null;
let activeCategory = null;
let detailOpen = false;
let segmentLayout = [];
let chartAnimation = 0;
let swipeStart = null;
let swipedToClose = false;
let chapterScrollTimer = 0;

function categoryName(key) {
  return CATEGORIES.find((item) => item.key === key)?.label || key;
}
function getCounts(chapter) {
  return CATEGORIES.map((category) => ({
    ...category,
    count: Array.isArray(chapter?.[category.key]) ? chapter[category.key].length : 0,
  }));
}
function countTotal(counts) {
  return counts.reduce((sum, item) => sum + item.count, 0);
}
function percent(count, total) {
  return total ? count / total * 100 : 0;
}
function formatPercent(value) {
  return `${Number(value.toFixed(2))}%`;
}
function displayText(value) {
  return String(value || '').replace(/\b([A-Za-z]+)\?s\b/g, (match, word) => `${word}'s`);
}
function makeArc(start, end, radius = 96) {
  const cx = 160;
  const cy = 160;
  if (end - start < 0.00001) return `M ${cx} ${cy} Z`;
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
}
function getSegmentTargets(chapter) {
  const counts = getCounts(chapter);
  const total = countTotal(counts);
  let angle = -Math.PI / 2;
  return counts.map((item) => {
    const start = angle;
    angle += total ? (item.count / total) * Math.PI * 2 : 0;
    return { ...item, start, end: angle, opacity: item.count ? 1 : 0 };
  });
}
function wrapLabel(label, maxLength = 12) {
  const lines = [];
  let line = '';
  String(label).split(/\s+/).forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}
function addChartLabel(parent, text, x, y, className, anchor) {
  const node = document.createElementNS(svgNS, 'text');
  node.classList.add(className);
  node.setAttribute('x', String(x));
  node.setAttribute('y', String(y));
  node.setAttribute('text-anchor', anchor);
  node.setAttribute('dominant-baseline', 'middle');
  node.textContent = text;
  parent.appendChild(node);
}
function renderChartLabels(layout, total) {
  let layer = pieChart.querySelector('.pie-label-layer');
  if (!layer) {
    layer = document.createElementNS(svgNS, 'g');
    layer.classList.add('pie-label-layer');
    pieChart.appendChild(layer);
  }
  layer.replaceChildren();
  const inside = [];
  const outside = [];
  const labelStep = matchMedia('(max-width: 740px)').matches ? 14 : 8.5;
  layout.forEach((segment) => {
    if (!segment.count) return;
    (percent(segment.count, total) >= 20 ? inside : outside).push(segment);
  });

  inside.forEach((segment) => {
    const middle = (segment.start + segment.end) / 2;
    const x = 160 + 46 * Math.cos(middle);
    const y = 160 + 46 * Math.sin(middle);
    const nameLines = wrapLabel(segment.label);
    const lines = [...nameLines, formatPercent(percent(segment.count, total)), `${segment.count} ${segment.count === 1 ? 'record' : 'records'}`];
    const firstY = y - ((lines.length - 1) * labelStep) / 2;
    lines.forEach((line, index) => {
      addChartLabel(layer, line, x, firstY + index * labelStep, index < nameLines.length ? 'pie-label-name' : 'pie-label-meta', 'middle');
    });
  });

  const callouts = { left: [], right: [] };
  outside.forEach((segment) => {
    const middle = (segment.start + segment.end) / 2;
    const side = Math.cos(middle) >= 0 ? 'right' : 'left';
    callouts[side].push({ segment, middle, idealY: 160 + 96 * Math.sin(middle) });
  });
  Object.entries(callouts).forEach(([side, items]) => {
    items.sort((a, b) => a.idealY - b.idealY);
    const top = 26;
    const bottom = 294;
    const spacing = items.length > 1 ? Math.min(labelStep * 4, (bottom - top) / (items.length - 1)) : 0;
    const groupHeight = spacing * (items.length - 1);
    const center = items.reduce((sum, item) => sum + item.idealY, 0) / items.length;
    const firstY = Math.max(top, Math.min(bottom - groupHeight, center - groupHeight / 2));
    const positions = items.map((item, index) => items.length === 1 ? Math.max(top, Math.min(bottom, item.idealY)) : firstY + index * spacing);

    items.forEach(({ segment, middle }, index) => {
      const y = positions[index];
      const boundaryRadius = 96;
      const outerRadius = 108;
      const startX = 160 + boundaryRadius * Math.cos(middle);
      const startY = 160 + boundaryRadius * Math.sin(middle);
      const outerX = 160 + outerRadius * Math.cos(middle);
      const outerY = 160 + outerRadius * Math.sin(middle);
      const railX = side === 'right' ? 160 + outerRadius : 160 - outerRadius;
      const labelEdgeX = side === 'right' ? 276 : 62;
      const leader = document.createElementNS(svgNS, 'path');
      leader.classList.add('pie-leader');
      leader.dataset.category = segment.key;
      leader.setAttribute('d', `M ${startX} ${startY} L ${outerX} ${outerY} L ${railX} ${outerY} L ${labelEdgeX} ${y}`);
      layer.appendChild(leader);

      const anchor = side === 'right' ? 'end' : 'start';
      const textX = side === 'right' ? 316 : 4;
      const nameLines = wrapLabel(segment.label);
      const lines = [...nameLines, formatPercent(percent(segment.count, total)), `${segment.count} ${segment.count === 1 ? 'record' : 'records'}`];
      const firstY = y - ((lines.length - 1) * labelStep) / 2;
      lines.forEach((line, lineIndex) => {
        addChartLabel(layer, line, textX, firstY + lineIndex * labelStep, lineIndex < nameLines.length ? 'pie-label-name' : 'pie-label-meta', anchor);
      });
    });
  });
}
function ensureSegments() {
  if (pieChart.children.length) return;
  CATEGORIES.forEach((category) => {
    const path = document.createElementNS(svgNS, 'path');
    path.classList.add('pie-slice');
    path.dataset.category = category.key;
    path.setAttribute('fill', category.color);
    path.setAttribute('role', 'button');
    path.setAttribute('tabindex', '0');
    path.addEventListener('click', () => {
      if (swipedToClose) { swipedToClose = false; return; }
      chooseCategory(category.key);
    });
    path.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        chooseCategory(category.key);
      }
    });
    pieChart.appendChild(path);
  });
}
function paintSegments(layout) {
  ensureSegments();
  const total = countTotal(layout);
  layout.forEach((segment) => {
    const path = pieChart.querySelector(`[data-category="${segment.key}"]`);
    path.setAttribute('d', makeArc(segment.start, segment.end));
    path.setAttribute('opacity', String(segment.opacity));
    path.setAttribute('aria-label', `${segment.label}: ${segment.count} ${segment.count === 1 ? 'record' : 'records'}, ${formatPercent(percent(segment.count, total))}`);
    path.setAttribute('aria-pressed', String(segment.key === activeCategory));
    path.classList.toggle('is-selected', segment.key === activeCategory);
    path.style.pointerEvents = segment.count ? 'auto' : 'none';
  });
  if (!total) {
    let empty = pieChart.querySelector('.pie-empty');
    if (!empty) {
      empty = document.createElementNS(svgNS, 'circle');
      empty.setAttribute('cx', '160'); empty.setAttribute('cy', '160'); empty.setAttribute('r', '96');
      empty.classList.add('pie-empty'); pieChart.appendChild(empty);
    }
  } else {
    pieChart.querySelector('.pie-empty')?.remove();
  }
  renderChartLabels(layout, total);
}
function renderChart(animate = true) {
  if (!currentChapter) return;
  const target = getSegmentTargets(currentChapter);
  const total = countTotal(target);
  $('totalCount').textContent = total.toLocaleString();
  renderLegend(target, total);
  if (!segmentLayout.length || !animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cancelAnimationFrame(chartAnimation);
    segmentLayout = target;
    paintSegments(target);
    return;
  }
  cancelAnimationFrame(chartAnimation);
  const from = segmentLayout.map((item, i) => ({
    ...item,
    start: segmentLayout[i]?.start ?? target[i].start,
    end: segmentLayout[i]?.end ?? target[i].end,
    opacity: segmentLayout[i]?.opacity ?? 0,
  }));
  const startTime = performance.now();
  const duration = 470;
  function frame(now) {
    const raw = Math.min(1, (now - startTime) / duration);
    const t = 1 - (1 - raw) ** 3;
    const current = target.map((item, i) => ({
      ...item,
      start: from[i].start + (item.start - from[i].start) * t,
      end: from[i].end + (item.end - from[i].end) * t,
      opacity: from[i].opacity + (item.opacity - from[i].opacity) * t,
    }));
    segmentLayout = current;
    paintSegments(current);
    if (raw < 1) chartAnimation = requestAnimationFrame(frame);
  }
  chartAnimation = requestAnimationFrame(frame);
}
function renderLegend(segments, total) {
  const legend = $('categoryLegend');
  legend.replaceChildren();
  segments.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'legend-item';
    button.classList.toggle('is-selected', item.key === activeCategory);
    button.setAttribute('aria-label', `${item.label}, ${item.count} ${item.count === 1 ? 'record' : 'records'}, ${formatPercent(percent(item.count, total))}`);
    const top = document.createElement('span'); top.className = 'legend-top';
    const name = document.createElement('span'); name.className = 'legend-name'; name.textContent = item.label;
    const dot = document.createElement('span'); dot.className = 'legend-dot'; dot.style.background = item.color;
    top.append(name, dot);
    const value = document.createElement('span'); value.className = 'legend-value';
    value.append(document.createTextNode(`${formatPercent(percent(item.count, total))} `));
    const count = document.createElement('small'); count.textContent = `${item.count} ${item.count === 1 ? 'record' : 'records'}`;
    value.append(count); button.append(top, value);
    button.addEventListener('click', () => chooseCategory(item.key));
    legend.appendChild(button);
  });
}
function renderChapterPicker() {
  chapterList.replaceChildren();
  let lastClass = null;
  chapters.forEach((chapter, index) => {
    const md = chapter.metadata;
    if (md.class !== lastClass) {
      lastClass = md.class;
      const group = document.createElement('div'); group.className = 'class-group-label';
      group.textContent = `CLASS ${md.class}`;
      chapterList.appendChild(group);
    }
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'chapter-button';
    button.dataset.index = String(index);
    button.setAttribute('aria-current', String(chapter === currentChapter));
    button.setAttribute('aria-label', `Class ${md.class}, chapter ${md.chapter_number}: ${md.chapter_name}`);
    const number = document.createElement('span'); number.className = 'chapter-number'; number.textContent = String(md.chapter_number);
    button.append(number);
    button.addEventListener('click', () => selectChapter(index));
    chapterList.appendChild(button);
  });
  requestAnimationFrame(() => chapterList.querySelector('[aria-current="true"]')?.scrollIntoView({block:'center',behavior:'smooth'}));
}
function selectChapter(index) {
  if (!chapters[index] || chapters[index] === currentChapter) return;
  currentChapter = chapters[index];
  activeCategory = null;
  chapterList.querySelectorAll('.chapter-button').forEach((button) => {
    button.setAttribute('aria-current', String(Number(button.dataset.index) === index));
  });
  updateChapterHeading();
  renderChart(true);
  if (detailOpen) closeDetails();
}
function updateChapterHeading() {
  const md = currentChapter.metadata;
  $('classLabel').textContent = `CLASS ${md.class} · PHYSICS`;
  $('chapterTitle').textContent = titleCase(md.chapter_name);
  $('chapterBook').textContent = md.book;
}
function titleCase(text) {
  return String(text || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
function recordTitle(category, item) {
  if (category === 'definitions') return item.term || item.name || 'Definition';
  if (category === 'laws_principles') return item.name || item.title || 'Law / Principle';
  if (category === 'derivations') return item.title || item.name || 'Derivation';
  if (category === 'formulas') return item.name || item.description || 'Formula';
  if (category === 'concepts') return item.name || item.concept_name || 'Concept';
  if (category === 'graphs') return item.title || item.name || item.graph_title || 'Graph';
  if (category === 'applications') return item.name || item.application_name || 'Application';
  return item.concept_name || item.name || 'Related concept';
}
function recordBody(category, item) {
  if (category === 'definitions') return item.definition || item.description || '';
  if (category === 'laws_principles') return item.statement || item.description || '';
  if (category === 'derivations' || category === 'concepts') return '';
  if (category === 'formulas') {
    const formula = item.latex || item.formula_latex || item.formula;
    return formula ? `\\(${formula}\\)` : item.description || '';
  }
  if (category === 'graphs') {
    const parts = [];
    if (item.x_axis || item.y_axis) parts.push(`Axes: ${item.x_axis || '—'} / ${item.y_axis || '—'}`);
    if (item.relationship || item.qualitative_relationship) parts.push(item.relationship || item.qualitative_relationship);
    return parts.join('\n');
  }
  if (category === 'applications') return item.related_concept || item.description || '';
  return item.relationship || item.description || '';
}
function renderDetails() {
  if (!currentChapter || !activeCategory) return;
  const meta = currentChapter.metadata;
  const items = Array.isArray(currentChapter[activeCategory]) ? currentChapter[activeCategory] : [];
  const total = countTotal(getCounts(currentChapter));
  const count = items.length;
  $('detailContext').textContent = `CLASS ${meta.class} · CHAPTER ${meta.chapter_number}`;
  $('detailTitle').textContent = categoryName(activeCategory);
  $('detailCount').textContent = `${count} ${count === 1 ? 'record' : 'records'}`;
  $('detailPercent').textContent = formatPercent(percent(count,total));
  const list = $('detailRecords');
  window.MathJax?.typesetClear?.([list]);
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'empty-category';
    empty.textContent = `No ${categoryName(activeCategory).toLowerCase()} records are listed for this chapter.`;
    list.appendChild(empty); return;
  }
  items.forEach((item, index) => {
    const card = document.createElement('article'); card.className = 'record-card'; card.style.animationDelay = `${Math.min(index * 22, 220)}ms`;
    const number = document.createElement('span'); number.className = 'record-number'; number.textContent = String(index + 1);
    const title = document.createElement('h3'); title.className = 'record-title'; title.textContent = displayText(recordTitle(activeCategory,item));
    card.append(number,title);
    const bodyText = recordBody(activeCategory,item);
    if (bodyText) { const body = document.createElement('p'); body.className = 'record-body'; body.textContent = displayText(bodyText); card.appendChild(body); }
    if (activeCategory !== 'derivations' && activeCategory !== 'concepts') {
      const loc = item.source_location || {};
      const page = loc.printed_page != null ? `Printed p. ${loc.printed_page}` : (loc.pdf_page != null ? `PDF p. ${loc.pdf_page}` : '');
      if (page) { const metaLine = document.createElement('div'); metaLine.className = 'record-meta'; metaLine.textContent = page; card.appendChild(metaLine); }
    }
    list.appendChild(card);
  });
  if (activeCategory === 'formulas' && window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([list]).catch((error) => console.error('Unable to typeset formula records:', error));
  }
}
function animateDock(open) {
  const first = chartDock.getBoundingClientRect();
  detailOpen = open;
  workspace.classList.toggle('detail-open', open);
  detailPanel.setAttribute('aria-hidden', String(!open));
  $('chapterRail').setAttribute('aria-hidden', String(open));
  $('pieChart').setAttribute('aria-label', `${open ? 'Compact' : 'Interactive'} category pie chart for ${currentChapter.metadata.chapter_name}`);
  if (open) renderDetails();
  const last = chartDock.getBoundingClientRect();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !first.width || !last.width) return;
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / last.width;
  const sy = first.height / last.height;
  chartDock.style.transition = 'none';
  chartDock.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  requestAnimationFrame(() => {
    chartDock.style.transition = 'transform 460ms cubic-bezier(.22,.72,.18,1)';
    chartDock.style.transform = 'none';
    window.setTimeout(() => { chartDock.style.transition = ''; chartDock.style.transform = ''; }, 500);
  });
}
function chooseCategory(category) {
  activeCategory = category;
  if (!detailOpen) animateDock(true);
  else renderDetails();
  renderLegend(getSegmentTargets(currentChapter), countTotal(getCounts(currentChapter)));
  paintSegments(segmentLayout.length ? segmentLayout : getSegmentTargets(currentChapter));
}
function closeDetails() {
  if (!detailOpen) return;
  activeCategory = null;
  renderLegend(getSegmentTargets(currentChapter), countTotal(getCounts(currentChapter)));
  paintSegments(segmentLayout.length ? segmentLayout : getSegmentTargets(currentChapter));
  animateDock(false);
}
async function init() {
  try {
    const response = await fetch(DATA_URL, {cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    database = await response.json();
    chapters = [...(database.chapters || [])].sort((a,b) => {
      const ma=a.metadata, mb=b.metadata;
      return Number(ma.class)-Number(mb.class) || Number(ma.chapter_number)-Number(mb.chapter_number);
    });
    if (!chapters.length) throw new Error('No chapters found in Database A.');
    currentChapter = chapters[0];
    renderChapterPicker(); updateChapterHeading(); renderChart(false);
    $('closeDetail').addEventListener('click', closeDetails);
    chapterList.addEventListener('scroll', () => {
      window.clearTimeout(chapterScrollTimer);
      chapterScrollTimer = window.setTimeout(() => {
        if (detailOpen) return;
        const listRect = chapterList.getBoundingClientRect();
        const centerY = listRect.top + listRect.height / 2;
        let nearest = null;
        let nearestDistance = Infinity;
        chapterList.querySelectorAll('.chapter-button').forEach((button) => {
          const rect = button.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - centerY);
          if (distance < nearestDistance) {
            nearest = button;
            nearestDistance = distance;
          }
        });
        if (nearest) selectChapter(Number(nearest.dataset.index));
      }, 90);
    }, {passive:true});
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && detailOpen) closeDetails(); });
    installSwipeClose();
  } catch (error) {
    console.error('Unable to load Database A:',error);
    $('errorState').hidden = false;
    workspace.hidden = true;
  }
}
function installSwipeClose() {
  workspace.addEventListener('pointerdown', (event) => {
    if (!detailOpen) return;
    swipeStart = {x:event.clientX,y:event.clientY};
  }, {passive:true});
  workspace.addEventListener('pointerup', (event) => {
    if (!detailOpen || !swipeStart) return;
    const dx=event.clientX-swipeStart.x, dy=event.clientY-swipeStart.y;
    if (swipeStart.x <= 62 && dx > 76 && Math.abs(dy) < 70) {
      swipedToClose = true;
      closeDetails();
      window.setTimeout(()=>{swipedToClose=false;},350);
    }
    swipeStart=null;
  }, {passive:true});
  workspace.addEventListener('pointercancel',()=>{swipeStart=null;},{passive:true});
}
init();



