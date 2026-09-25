const managed=new Set(['item-full-res-photos','room-photos','portal-job-assets']);
export function usageMessage(usage){
  if(!usage)return '';
  const total=(usage.retainedBytes+usage.reservedBytes)/usage.retainedLimit;
  const monthly=usage.monthlyBytes/usage.monthlyLimit;
  const pct=Math.max(total,monthly);
  const gb=n=>(n/1e9).toFixed(2)+' GB';
  return (pct>=1?'Storage threshold exceeded: ':pct>=.95?'Storage warning: ':pct>=.8?'Storage heads-up: ':'')+
    gb(usage.retainedBytes)+' stored of '+gb(usage.retainedLimit)+'; '+gb(usage.monthlyBytes)+' of '+gb(usage.monthlyLimit)+' uploaded/reserved this month (UTC).'+
    (usage.warningOnly?' Warning-only account: these storage thresholds do not block uploads. Technical file limits still apply.':'');
}
export function installStorageBudget(client,accountId=()=>null){
  if(client.__qdrBudget)return client.__qdrBudget;
  async function request(body,file){
    body.accountId=accountId();
    let payload=body;
    if(file){payload=new FormData();payload.append('metadata',JSON.stringify(body));payload.append('file',file);}
    const result=await client.functions.invoke('storage-budget',{body:payload});
    if(result.error){
      let message=result.error.message;
      try{const data=await result.error.context?.json();message=data?.error||message;}catch{}
      return {data:null,error:new Error(message||'Storage is unavailable. Refresh and retry.')};
    }
    if(result.data?.error)return {data:null,error:new Error(result.data.error)};
    const value=result.data;
    if(value?.usage){
      client.__qdrStorageUsage=value.usage;
      globalThis.dispatchEvent?.(new CustomEvent('qdr-storage-usage',{detail:value.usage}));
      if(Math.max((value.usage.retainedBytes+value.usage.reservedBytes)/value.usage.retainedLimit,value.usage.monthlyBytes/value.usage.monthlyLimit)>=.8){
        globalThis.qdToast?.({title:'Account storage',message:usageMessage(value.usage),type:'warning'});
      }
    }
    return value;
  }
  const original=client.storage.from.bind(client.storage);
  client.storage.from=function(bucket){
    const api=original(bucket);
    if(managed.has(bucket)){
      api.upload=(path,file)=>request({action:'upload',bucket,path},file);
      api.remove=paths=>request({action:'remove',bucket,paths});
    }
    return api;
  };
  client.__qdrBudget={usage:()=>request({action:'usage'})};
  return client.__qdrBudget;
}
