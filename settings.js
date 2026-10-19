(() => {
  'use strict';
  const UI=MeetingUI,state=UI.state,$=id=>document.getElementById(id);
  const message=text=>{$('settings-status').textContent=text;};
  function setDefault(entry){
    state.defaultTimezone=entry.zone;state.defaultPlace=entry.label;
    UI.chooseZone('source',entry);message('Default timezone saved.');
  }
  UI.setupZone('default','source',setDefault,()=>state.defaultPlace||UI.city(state.defaultTimezone));
  $('browser-default').onclick=()=>{const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';setDefault({zone,label:UI.city(zone)});$('default-zone').value=state.defaultPlace;};
  for(const field of ['source','target']){
    const hours=state[field+'Hours'];
    for(const part of ['start','end']){
      const input=$(field+'-away-'+part);input.value=hours[part];
      input.addEventListener('change',()=>{if(!input.value){input.value=hours[part];return;}hours[part]=input.value;UI.refreshCalendar();UI.save();updateKey();message('Away hours saved.');});
    }
    const enabled=$(field+'-away-enabled');enabled.checked=hours.enabled;
    enabled.onchange=()=>{hours.enabled=enabled.checked;UI.refreshCalendar();UI.save();updateKey();message('Away hours saved.');};
  }
  function updateKey(){
    for(const field of ['source','target']){
      const hours=state[field+'Hours'],label=field==='source'?'My':'Their';
      $(field+'-away-key').textContent=`${label} away${!hours.enabled||hours.start===hours.end?' (off)':''}`;
      $(field+'-away-key').parentElement.title=`${label} away hours: ${hours.start} to ${hours.end}, in ${state[field]}`;
    }
  }
  function favoritesChanged(){UI.save();document.dispatchEvent(new CustomEvent('favoriteschange'));}
  UI.removeFavorite=index=>{if(index<0||index>=state.favorites.length)return;state.favorites.splice(index,1);favoritesChanged();message('City removed from map.');};
  UI.setupZone('favorite','target',entry=>{
    if(state.favorites.some(f=>UI.favoriteKey(f)===UI.favoriteKey(entry))){message('That city is already on the map.');return;}
    if(state.favorites.length>=50){message('Up to 50 favorites can be saved. Remove one to add another.');return;}
    state.favorites.push({zone:entry.zone,label:entry.label,detail:entry.detail||entry.zone,...(Number.isFinite(entry.lat)&&Number.isFinite(entry.lon)?{lat:entry.lat,lon:entry.lon}:{})});
    favoritesChanged();message('Favorite added.');
  },()=> '',{cityOnly:true});
  $('favorite-zone').placeholder='Search to add a city';
  document.addEventListener('zonechange',updateKey);
  updateKey();UI.save();
})();
