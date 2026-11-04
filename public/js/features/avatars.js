// 프로필 동물 7종. 동그란 테두리 + 굵은 선 + 점 눈, 색은 하나씩만 (작게 보여도 알아보게)
window.Avatars = (() => {
  const INK = '#211a15', PAPER = '#fffaf0';
  // [영문, 이름, 색, 그림(C=색, K=잉크, P=종이)]
  const ANIMALS = [
  ['cat', '고양이', '#e07a3a', `
    <path d="M10.5 18.5 9 7.5l8 6.2M29.5 18.5 31 7.5l-8 6.2" fill="C" stroke="K" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M7.5 25c0-7 5.6-11.6 12.5-11.6S32.5 18 32.5 25c0 5.5-5.6 8.6-12.5 8.6S7.5 30.5 7.5 25z" fill="P" stroke="K" stroke-width="2.4"/>
    <circle cx="15.2" cy="24" r="1.7" fill="K"/><circle cx="24.8" cy="24" r="1.7" fill="K"/>
    <path d="M18.3 27.6q1.7 1.4 3.4 0" fill="none" stroke="K" stroke-width="1.6" stroke-linecap="round"/>`],
  ['dog', '강아지', '#7a5230', `
    <path d="M8 24c0-7 5.4-11.8 12-11.8S32 17 32 24c0 6-5.4 9.6-12 9.6S8 30 8 24z" fill="P" stroke="K" stroke-width="2.4"/>
    <path d="M11.5 13.5C7 13 4.6 17 5.4 22.5c.5 3.2 3.3 3.6 4.6 1.4l2.6-5.2M28.5 13.5c4.5-.5 6.9 3.5 6.1 9-.5 3.2-3.3 3.6-4.6 1.4l-2.6-5.2" fill="C" stroke="K" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="15.5" cy="23" r="1.7" fill="K"/><circle cx="24.5" cy="23" r="1.7" fill="K"/>
    <ellipse cx="20" cy="27.4" rx="2.4" ry="1.7" fill="K"/>`],
  ['rabbit', '토끼', '#e2789a', `
    <path d="M14.2 16.5C12 11 12.3 4.6 14.8 4.4s3.4 6.4 2.8 11.6M25.8 16.5C28 11 27.7 4.6 25.2 4.4s-3.4 6.4-2.8 11.6" fill="P" stroke="K" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M14.9 14.5c-.9-3.2-.8-6.3.1-7.1M25.1 14.5c.9-3.2.8-6.3-.1-7.1" fill="none" stroke="C" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M8.5 25.5c0-6.4 5.1-10.4 11.5-10.4s11.5 4 11.5 10.4c0 5-5.1 8.1-11.5 8.1s-11.5-3.1-11.5-8.1z" fill="P" stroke="K" stroke-width="2.4"/>
    <circle cx="15.6" cy="24.6" r="1.6" fill="K"/><circle cx="24.4" cy="24.6" r="1.6" fill="K"/>
    <ellipse cx="12.4" cy="28.2" rx="2" ry="1.3" fill="C"/><ellipse cx="27.6" cy="28.2" rx="2" ry="1.3" fill="C"/>`],
  ['bear', '곰', '#c2452d', `
    <circle cx="11.5" cy="13.5" r="4.4" fill="P" stroke="K" stroke-width="2.4"/><circle cx="28.5" cy="13.5" r="4.4" fill="P" stroke="K" stroke-width="2.4"/>
    <circle cx="11.5" cy="13.5" r="1.9" fill="C"/><circle cx="28.5" cy="13.5" r="1.9" fill="C"/>
    <path d="M7.5 24c0-7.2 5.6-11.6 12.5-11.6S32.5 16.8 32.5 24c0 6.2-5.6 9.6-12.5 9.6S7.5 30.2 7.5 24z" fill="P" stroke="K" stroke-width="2.4"/>
    <circle cx="15" cy="22.6" r="1.6" fill="K"/><circle cx="25" cy="22.6" r="1.6" fill="K"/>
    <ellipse cx="20" cy="27.6" rx="4.6" ry="3.4" fill="P" stroke="K" stroke-width="1.8"/>
    <ellipse cx="20" cy="26.6" rx="1.9" ry="1.3" fill="C"/>`],
  ['hamster', '햄스터', '#d9a14a', `
    <circle cx="12" cy="14" r="3.2" fill="C" stroke="K" stroke-width="2.2"/><circle cx="28" cy="14" r="3.2" fill="C" stroke="K" stroke-width="2.2"/>
    <path d="M5.8 24.5c0-7 6.4-11.4 14.2-11.4s14.2 4.4 14.2 11.4c0 6-6.4 9.2-14.2 9.2S5.8 30.5 5.8 24.5z" fill="P" stroke="K" stroke-width="2.4"/>
    <path d="M14 14.6c2.2-1 3.8-1.3 6-1.3s3.8.3 6 1.3c-.6 3-2.8 4.7-6 4.7s-5.4-1.7-6-4.7z" fill="C"/>
    <ellipse cx="10.6" cy="27" rx="3.6" ry="3" fill="C"/><ellipse cx="29.4" cy="27" rx="3.6" ry="3" fill="C"/>
    <circle cx="15.4" cy="23.2" r="1.6" fill="K"/><circle cx="24.6" cy="23.2" r="1.6" fill="K"/>
    <path d="M18.6 26.6l1.4 1 1.4-1" fill="none" stroke="K" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`],
  ['duck', '오리', '#f2b51e', `
    <path d="M18 11.5c-.2-2.4.7-4.4 2-5.3M21.5 11.3c.8-2 2.4-3.2 4-3.4" fill="none" stroke="K" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="20" cy="21.5" r="11" fill="P" stroke="K" stroke-width="2.4"/>
    <circle cx="15.6" cy="19.6" r="1.6" fill="K"/><circle cx="24.4" cy="19.6" r="1.6" fill="K"/>
    <path d="M13.5 25.2c2-1.6 4.3-2.2 6.5-2.2s4.5.6 6.5 2.2c-1.4 2.6-3.8 3.6-6.5 3.6s-5.1-1-6.5-3.6z" fill="C" stroke="K" stroke-width="2" stroke-linejoin="round"/>`],
  ['deer', '사슴', '#3f7d5a', `
    <path d="M14 13.5 11.5 8.5M11.5 8.5 8 7.2M11.5 8.5l.2-4M26 13.5l2.5-5M28.5 8.5 32 7.2M28.5 8.5l-.2-4" fill="none" stroke="C" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M10.5 17.5c-3.2-.4-5-2.4-4.6-4.2 2.6-.4 5 .9 6.6 3M29.5 17.5c3.2-.4 5-2.4 4.6-4.2-2.6-.4-5 .9-6.6 3" fill="P" stroke="K" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M9 23.5c0-6.4 5-10.6 11-10.6s11 4.2 11 10.6c0 5.8-5 9.6-11 9.6s-11-3.8-11-9.6z" fill="P" stroke="K" stroke-width="2.4"/>
    <circle cx="16" cy="16.8" r="1.1" fill="C"/><circle cx="20" cy="15.6" r="1.1" fill="C"/><circle cx="24" cy="16.8" r="1.1" fill="C"/>
    <circle cx="15.6" cy="23" r="1.6" fill="K"/><circle cx="24.4" cy="23" r="1.6" fill="K"/>
    <ellipse cx="20" cy="28" rx="1.8" ry="1.3" fill="K"/>`]
];
  const nameOf = n => (ANIMALS[(Number(n) || 1) - 1] || ANIMALS[0])[1];
  function svg(n) {
    const a = ANIMALS[(Number(n) || 1) - 1] || ANIMALS[0];
    const g = a[3].replace(/="C"/g, '="' + a[2] + '"').replace(/="K"/g, '="' + INK + '"').replace(/="P"/g, '="' + PAPER + '"');
    return '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.6" fill="' + PAPER + '"/><clipPath id="mk-clip"><circle cx="20" cy="20" r="17.5"/></clipPath><g clip-path="url(#mk-clip)">' + g + '</g><circle cx="20" cy="20" r="18.6" fill="none" stroke="' + INK + '" stroke-width="2.2"/></svg>';
  }
  return { svg, count: ANIMALS.length, nameOf };
})();
