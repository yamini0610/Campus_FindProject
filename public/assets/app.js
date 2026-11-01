const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];let me=null,allItems=[],allClaims=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,opts={}){let r=await fetch('/api'+url,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})},credentials:'same-origin'});let d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Request failed');return d}
function msg(t,ok=false){let e=$('#formMsg');if(e){e.textContent=t;e.style.color=ok?'#32845d':'#bd5968'}}
async function initAuth(){let lf=$('#loginForm');if(lf){const saved=JSON.parse(localStorage.getItem('cf_savedEmails')||'[]');let em=lf.querySelector('[name=email]');if(saved.length&&em){let dl=document.createElement('datalist');dl.id='savedEmailList';saved.forEach(x=>{let o=document.createElement('option');o.value=x;dl.append(o)});lf.append(dl);em.setAttribute('list',dl.id)}lf.addEventListener('submit',async e=>{e.preventDefault();let f=new FormData(lf),email=String(f.get('email')||'').trim().toLowerCase(),password=f.get('password')||'';if(!email||!password)return msg('Please fill in all required fields.');if(!/^[^@\s]+@sastra\.ac\.in$/.test(email))return msg('Use your college email ending in @sastra.ac.in.');try{let d=await api('/login',{method:'POST',body:JSON.stringify({email,password})});me=d.user;if($('#rememberEmail').checked){let a=JSON.parse(localStorage.getItem('cf_savedEmails')||'[]');a=[email,...a.filter(x=>x!==email)].slice(0,5);localStorage.setItem('cf_savedEmails',JSON.stringify(a))}msg('Login successful.',true);location.href='dashboard.html'}catch(x){msg(x.message)}})}
let rf=$('#registerForm');if(rf)rf.addEventListener('submit',async e=>{e.preventDefault();let f=new FormData(rf),data=Object.fromEntries(f);data.email=(data.email||'').trim().toLowerCase();try{await api('/register',{method:'POST',body:JSON.stringify(data)});msg('Account created successfully.',true);location.href='dashboard.html'}catch(x){msg(x.message)}})}
function card(it){return `<article class="item"><div class="item-thumb">${it.photo?`<img src="${it.photo}" alt="Item photo">`:it.kind==='found'?'✦':'⌕'}</div><div class="item-main"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(it.name)}</h3><span class="status">${esc((it.status||it.kind).toUpperCase())}</span></div><p>${esc(it.kind.toUpperCase())} · ${esc(it.category)} · ${esc(it.location)}</p><p>${esc(it.description)}</p><p>${esc(it.item_date||it.date||'')} · Reported by ${esc(it.owner||'Student')}</p>${it.kind==='found'&&it.status==='found'&&me&&it.user_id!==me.id?`<button class="mini-btn" data-claim="${it.id}">Claim item</button>`:''}</div></article>`}
async function renderItems(){let el=$('#itemList');if(!el)return;try{allItems=await api('/items');let f=el.dataset.filter||'all';let list=allItems.filter(x=>(f==='all'||x.kind===f)&&(!(el.dataset.mine==='true')||x.owner_email===me?.email));let q=$('#searchInput')?.value?.toLowerCase()||'';if(q)list=list.filter(x=>[x.name,x.category,x.location,x.description].join(' ').toLowerCase().includes(q));el.innerHTML=list.length?list.map(card).join(''):'<div class="empty">No matching items yet.</div>';$$('[data-claim]',el).forEach(b=>b.onclick=async()=>{let details=prompt('Enter private details to help verify ownership:');if(!details)return;try{await api('/claims',{method:'POST',body:JSON.stringify({itemId:b.dataset.claim,details})});alert('Claim submitted for admin review.');await renderClaims()}catch(e){alert(e.message)}})}catch(e){el.innerHTML=`<div class="empty">${esc(e.message)} Please check the server connection.</div>`}}
async function initItemForm(){let form=$('#itemForm');if(!form)return;form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;let f=new FormData(form),data=Object.fromEntries(f),file=f.get('photo');if(file?.size){if(file.size>1800000)return msg('Please choose an image under 1.8 MB.');data.photo=await new Promise((resolve,reject)=>{let r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}else data.photo=null;data.kind=form.dataset.kind;try{await api('/items',{method:'POST',body:JSON.stringify(data)});msg('Report saved successfully.',true);form.reset();setTimeout(()=>location.href='dashboard.html',600)}catch(x){msg(x.message)}})}
async function renderAdminItems(){let el=$('#adminItemList');if(!el||me?.role!=='admin')return;try{let rows=await api('/admin/items');el.innerHTML=rows.length?rows.map(i=>`<article class="item"><div class="item-main"><h3>${esc(i.name)} · ${esc(i.status)}</h3><p>${esc(i.kind)} · ${esc(i.owner)} · ${esc(i.location)}</p>${i.status==='claimed'?`<button class="mini-btn" data-collected="${i.id}">Mark collected</button>`:''}</div></article>`).join(''):'<div class="empty">No reports yet.</div>';$$('[data-collected]',el).forEach(b=>b.onclick=async()=>{try{await api('/admin/items/'+b.dataset.collected+'/collected',{method:'PATCH'});await renderAdminItems();alert('Item marked collected. Student notification created.')}catch(e){alert(e.message)}})}catch(e){el.innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
async function renderNotifications(){let el=$('#notificationList');if(!el)return;try{let rows=await api('/notifications');el.innerHTML=rows.length?rows.map(n=>`<article class="item" style="opacity:${n.read_at?'0.68':'1'}"><div class="item-thumb">${n.read_at?'✓':'♧'}</div><div class="item-main"><h3>${esc(n.item_name||'CampusFind update')}</h3><p>${esc(n.message)}</p><p>${esc(new Date(n.sent_at).toLocaleString())} · ${esc(n.kind.replaceAll('_',' '))}</p>${!n.read_at?`<button class="mini-btn" data-read="${n.id}">Mark as read</button>`:''}</div></article>`).join(''):'<div class="empty">No notifications yet.</div>';$$('[data-read]',el).forEach(b=>b.onclick=async()=>{await api('/notifications/'+b.dataset.read+'/read',{method:'PATCH'});renderNotifications()})}catch(e){el.innerHTML=`<div class="empty">${esc(e.message)}. Please sign in.</div>`}}
async function renderClaims(){let el=$('#claimList');if(!el)return;try{allClaims=await api('/claims');el.innerHTML=allClaims.length?allClaims.map(c=>`<article class="item"><div class="item-main"><h3>${esc(c.item_name)}</h3><p>${esc(c.details)}</p><span class="status">${esc(c.status)}</span>${me?.role==='admin'?`<p>${esc(c.claimant)} · ${esc(c.email)}</p><button class="mini-btn" data-approve="${c.id}">Approve</button> <button class="mini-btn" data-reject="${c.id}">Reject</button>`:''}</div></article>`).join(''):'<div class="empty">No claims found.</div>';$$('[data-approve]').forEach(b=>b.onclick=()=>decide(b.dataset.approve,'approved'));$$('[data-reject]').forEach(b=>b.onclick=()=>decide(b.dataset.reject,'rejected'))}catch(e){el.innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
async function decide(id,status){try{await api('/claims/'+id,{method:'PATCH',body:JSON.stringify({status})});await renderClaims();alert('Claim updated. In-app notification created.')}catch(e){alert(e.message)}}
async function init(){ $('#menuToggle')?.addEventListener('click',()=>$('#mainNav')?.classList.toggle('open'));try{me=(await api('/me')).user}catch{}await initAuth();await initItemForm();$('#searchInput')?.addEventListener('input',renderItems);$('#kindFilter')?.addEventListener('change',renderItems);if($('#welcomeTitle')){if(!me){location.href='login.html';return}$('#welcomeTitle').textContent='Welcome, '+me.name+'.';let own=(await api('/items')).filter(i=>i.user_id===me.id);$('#statReports').textContent=own.length;$('#statFound').textContent=own.filter(i=>i.kind==='found').length;$('#statClaims').textContent=(await api('/claims')).filter(c=>c.status==='pending').length}await renderItems();await renderClaims();await renderNotifications();await renderActivityHistory();await renderAdminItems();if(location.pathname.endsWith('/admin.html')){if(me?.role!=='admin'){alert('Admin access required');location.href='login.html'}}}
async function renderActivityHistory() {
    const list = document.getElementById('historyList');

    if (!list) return;

    try {
        const activities = await api('/history');

        if (!activities.length) {
            list.innerHTML =
                '<div class="empty">No activity history yet.</div>';
            return;
        }

        list.innerHTML = activities.map(activity => {
            const date = new Date(activity.created_at);

            const dateTime = date.toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            return `
                <article class="item">
                    <div class="item-thumb">◷</div>
                    <div class="item-main">
                        <h3>${esc(activity.activity_type.replaceAll('_', ' '))}</h3>
                        <p>${esc(activity.description)}</p>
                        <p>${esc(dateTime)}</p>
                    </div>
                </article>
            `;
        }).join('');

    } catch (error) {
        list.innerHTML =
            `<div class="empty">${esc(error.message)}</div>`;
    }
}
document.addEventListener('DOMContentLoaded',init);

const logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {
logoutBtn.addEventListener('click', async () => {
try {
const response = await fetch('/api/logout', {
method: 'POST',
credentials: 'same-origin'
});

        if (response.ok) {
            window.location.href = 'index.html';
        } else {
            alert('Logout failed. Please try again.');
        }
    } catch (error) {
        alert('Unable to logout. Please try again.');
    }
});

}
