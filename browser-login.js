(() => {
 'use strict';
 const input=document.getElementById('access-token'),button=document.getElementById('login-button'),status=document.getElementById('login-status');
 async function login(){
  button.disabled=true;status.textContent='Oturum açılıyor…';
  const token=input.value;input.value='';
  try{
   const response=await fetch('/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
   if(response.ok){location.replace('/');return;}
   status.textContent=response.status===429?'Çok fazla deneme. Bir dakika sonra tekrar deneyin.':response.status===401?'Erişim anahtarı doğrulanamadı.':'Oturum açılamadı. Lütfen tekrar deneyin.';
  }catch{status.textContent='Sunucuya ulaşılamadı. Lütfen tekrar deneyin.';}
  button.disabled=false;input.focus();
 }
 button.addEventListener('click',login);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!button.disabled)login();}});
})();
