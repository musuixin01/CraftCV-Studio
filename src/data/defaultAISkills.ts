/** AI writing skill library. Existing packs are cleared once per browser profile; newly created packs remain usable. */
export interface AISkill {
  id: string;
  name: string;
  category: string;
  description: string;
  skillMarkdown: string;
  isBuiltIn?: boolean;
}
export const STORAGE_AI_SKILLS_KEY='craftcv_ai_skills_v1';
export const STORAGE_SELECTED_SKILLS_KEY='craftcv_selected_skill_ids_v1';
export const STORAGE_AUTO_SKILL_MODE_KEY='craftcv_auto_skill_mode_v1';
/** One-time reset explicitly requested on 2026-11-09. Never clear newly added skills again. */
export const STORAGE_SKILLS_RESET_MARKER_KEY='craftcv_ai_skills_reset_20261109_v1';
export function ensureInitialSkillLibraryReset(): boolean {
  try {
    if(typeof localStorage==='undefined')return false;
    if(localStorage.getItem(STORAGE_SKILLS_RESET_MARKER_KEY)==='complete')return true;
    // Only these three keys contain AI skill packs or their selection settings.
    // Resume, version, evidence, editor and model settings must remain untouched.
    localStorage.removeItem(STORAGE_AI_SKILLS_KEY);
    localStorage.removeItem(STORAGE_SELECTED_SKILLS_KEY);
    localStorage.removeItem(STORAGE_AUTO_SKILL_MODE_KEY);
    localStorage.setItem(STORAGE_SKILLS_RESET_MARKER_KEY,'complete');
    return true;
  }catch{
    // Do not mark the reset completed unless all three removals succeeded.
    return false;
  }
}


const LEGACY_BUILTIN_IDS = new Set([
  'skill-embedded-rtos','skill-peripheral-control','skill-star-quantify',
  'skill-hardware-fpga','skill-onepage-compact',
]);

/** Built-in package definitions are intentionally empty. */
export const DEFAULT_AI_SKILLS: AISkill[] = [];

function isUserSkill(value: unknown): value is AISkill {
  if (typeof value !== 'object' || value === null) return false;
  const item=value as Record<string,unknown>;
  return typeof item.id === 'string' && item.id.trim().length > 0
    && !LEGACY_BUILTIN_IDS.has(item.id) && item.isBuiltIn !== true
    && typeof item.name === 'string'
    && typeof item.skillMarkdown === 'string'
    && typeof item.description === 'string'
    && typeof item.category === 'string';
}
function localGet(key:string):string|null{
  try { return typeof localStorage==='undefined' ? null : localStorage.getItem(key); }
  catch { return null; }
}
function localSet(key:string,value:string):void{
  try { if(typeof localStorage!=='undefined')localStorage.setItem(key,value); }
  catch { /* Browser storage may be blocked. Leave data untouched. */ }
}

export function loadAISkills():AISkill[]{
  if(!ensureInitialSkillLibraryReset())return [];
  try{
    const raw=localGet(STORAGE_AI_SKILLS_KEY);
    const data=raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.filter(isUserSkill) : [];
  }catch{return [];}
}
export function saveAISkills(skills:AISkill[]):void{
  if(!ensureInitialSkillLibraryReset())return;
  // Saving the library only writes user-authored skills, never revives defaults.
  localSet(STORAGE_AI_SKILLS_KEY,JSON.stringify(skills.filter(isUserSkill)));
}
export function loadSelectedSkillIds():string[]{
  if(!ensureInitialSkillLibraryReset())return [];
  try{
    const raw=localGet(STORAGE_SELECTED_SKILLS_KEY);
    const data=raw ? JSON.parse(raw) : [];
    return Array.isArray(data)
      ? data.filter((value): value is string => typeof value==='string'&&!LEGACY_BUILTIN_IDS.has(value))
      : [];
  }catch{return [];}
}
export function saveSelectedSkillIds(ids:string[]):void{
  if(!ensureInitialSkillLibraryReset())return;
  localSet(STORAGE_SELECTED_SKILLS_KEY,JSON.stringify(ids.filter((id)=>!LEGACY_BUILTIN_IDS.has(id))));
}
export function loadAutoSkillMode():boolean{
  if(!ensureInitialSkillLibraryReset())return true;
  const raw=localGet(STORAGE_AUTO_SKILL_MODE_KEY);
  return raw===null ? true : raw==='true';
}
export function saveAutoSkillMode(auto:boolean):void{
  if(!ensureInitialSkillLibraryReset())return;
  localSet(STORAGE_AUTO_SKILL_MODE_KEY,String(auto));
}

/**
 * Conservative matching for user-authored library only.
 * An empty catalog is valid and falls back to the application's shared rules.
 */
export function recommendSkillsForTarget(
  allSkills:AISkill[],sectionType:string,sectionTitle:string,payload:unknown,targetRole='',
):{matchedIds:string[];reason:string}{
  const candidates=allSkills.filter(isUserSkill);
  if(!candidates.length)
    return {matchedIds:[],reason:'没有自定义技能包，直接采用统一简历写作规范'};
  const text=[sectionType,sectionTitle,targetRole,JSON.stringify(payload??{})].join(' ').toLowerCase();
  const matched=candidates.filter((skill)=>{
    const terms=[skill.name,skill.category].join(' ').toLowerCase()
      .split(/[\s,，、/·\-]+/).filter((v)=>v.length>=2);
    return terms.some((word)=>text.includes(word));
  });
  const chosen=(matched.length>0?matched:candidates.length<=2?candidates:[]);
  return {
    matchedIds:chosen.slice(0,3).map((skill)=>skill.id),
    reason:chosen.length
      ? '根据当前岗位与条目选择自定义技能：'+chosen.slice(0,3).map((skill)=>skill.name).join('、')
      : '无明显匹配的自定义技能，将使用统一简历写作规范',
  };
}
