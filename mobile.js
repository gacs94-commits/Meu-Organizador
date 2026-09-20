// Mobile navigation and compact forms; existing fields and event handlers stay intact.
const mobileLayout = window.matchMedia('(max-width: 700px)');
function syncMobileLayout() {
  document.querySelectorAll('.mobile-form-details').forEach(details => {
    details.open = !mobileLayout.matches;
  });
  if(!mobileLayout.matches) closeSidebar();
}
function revealMobileForm(element) {
  const details = element?.closest('.mobile-form-details');
  if(details) details.open = true;
}
document.querySelectorAll('.section .card').forEach(card => {
  const heading = card.querySelector(':scope > h3');
  if(!heading || !card.querySelector('.form-actions') || !card.querySelector('input,textarea,select')) return;
  const details = document.createElement('details');
  details.className = 'mobile-form-details';
  const summary = document.createElement('summary');
  summary.textContent = heading.textContent;
  details.appendChild(summary);
  const content = document.createElement('div');
  content.className = 'mobile-form-content';
  while(card.firstChild) content.appendChild(card.firstChild);
  details.appendChild(content);
  card.appendChild(details);
  card.addEventListener('invalid',event=>revealMobileForm(event.target),true);
  new MutationObserver(()=>{summary.textContent=heading.textContent;}).observe(heading,{childList:true,subtree:true,characterData:true});
});
mobileLayout.addEventListener('change',syncMobileLayout);
syncMobileLayout();
