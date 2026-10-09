import type { GameEngine } from "./types";
export interface CheckerPiece { p: 0 | 1; king: boolean }
export interface CheckersMove { from: number; to: number; captured?: number; path?: number[]; capturedPieces?: number[] }
export interface CheckersState {
  board: (CheckerPiece | null)[]; turn: 0 | 1; chain: number | null;
  chainRemaining?: number; over: boolean; winner: number | null; lastMove: CheckersMove | null;
}
const rank=(i:number)=>Math.floor(i/8), file=(i:number)=>i%8, idx=(r:number,f:number)=>r*8+f;
const on=(r:number,f:number)=>r>=0&&r<8&&f>=0&&f<8;
const DIRS=[[-1,-1],[-1,1],[1,-1],[1,1]] as const;
export const isDarkSquare=(i:number)=>(rank(i)+file(i))%2===1;
export function checkersTimeout(s:CheckersState):CheckersState {
 const moves=legalMoves(s); return s.over||!moves.length?s:checkersEngine.applyMove(s,moves[Math.floor(Math.random()*moves.length)]!);
}
function clone(s:CheckersState):CheckersState{return {...s,board:s.board.map(p=>p?{...p}:null)}}
function capturesFor(board:(CheckerPiece|null)[],from:number):CheckersMove[]{
 const p=board[from]; if(!p)return []; const out:CheckersMove[]=[];
 for(const [dr,df] of DIRS){let r=rank(from)+dr,f=file(from)+df;
  if(!p.king){if(!on(r,f))continue;const t=idx(r,f),e=board[t],lr=r+dr,lf=f+df;
   if(e&&e.p!==p.p&&on(lr,lf)&&!board[idx(lr,lf)])out.push({from,to:idx(lr,lf),captured:t,path:[idx(lr,lf)],capturedPieces:[t]});
   continue;
  }
  while(on(r,f)&&!board[idx(r,f)]){r+=dr;f+=df}
  if(!on(r,f))continue;const t=idx(r,f),e=board[t];if(!e||e.p===p.p)continue;
  r+=dr;f+=df;while(on(r,f)&&!board[idx(r,f)]){out.push({from,to:idx(r,f),captured:t,path:[idx(r,f)],capturedPieces:[t]});r+=dr;f+=df}
 }return out;
}
function boardAfterCapture(board:(CheckerPiece|null)[],m:CheckersMove){
 const n=board.map(p=>p?{...p}:null);n[m.to]=n[m.from];n[m.from]=null;
 for(const x of m.capturedPieces??(m.captured===undefined?[]:[m.captured]))n[x]=null;return n;
}
function captureSequences(board:(CheckerPiece|null)[],from:number):CheckersMove[]{
 if(!board[from])return [];
 const walk=(pos:number,b:(CheckerPiece|null)[],path:number[],taken:number[]):CheckersMove[]=>{
  const steps=capturesFor(b,pos);
  if(!steps.length)return taken.length?[{from,to:pos,captured:taken[0],path:[...path],capturedPieces:[...taken]}]:[];
  const all:CheckersMove[]=[];
  for(const step of steps){const target=step.captured!;const after=boardAfterCapture(b,step);
   all.push(...walk(step.to,after,[...path,step.to],[...taken,target]));
  }return all;
 };
 return walk(from,board,[],[]);
}
function ordinaryMoves(board:(CheckerPiece|null)[],from:number):CheckersMove[]{
 const p=board[from];if(!p)return [];const out:CheckersMove[]=[];
 if(p.king){for(const [dr,df] of DIRS){let r=rank(from)+dr,f=file(from)+df;
  while(on(r,f)&&!board[idx(r,f)]){out.push({from,to:idx(r,f),path:[idx(r,f)]});r+=dr;f+=df}
 }}else{const dr=p.p===0?-1:1;for(const df of [-1,1]){const r=rank(from)+dr,f=file(from)+df;if(on(r,f)&&!board[idx(r,f)])out.push({from,to:idx(r,f),path:[idx(r,f)]})}}
 return out;
}
export function legalMoves(s:CheckersState):CheckersMove[]{
 if(s.over)return [];const captures:CheckersMove[]=[];
 for(let i=0;i<64;i++)if(s.board[i]?.p===s.turn)captures.push(...captureSequences(s.board,i));
 // Brazilian-style house rule requested for MozaPlay: any complete capture route is selectable, even if another route captures more pieces.\n if(captures.length)return captures;
 const moves:CheckersMove[]=[];for(let i=0;i<64;i++)if(s.board[i]?.p===s.turn)moves.push(...ordinaryMoves(s.board,i));return moves;
}
export const checkersEngine:GameEngine<CheckersState,CheckersMove>={
 id:"checkers",name:"Damas",minPlayers:2,maxPlayers:2,
 createGame(){const board:(CheckerPiece|null)[]=Array.from({length:64},()=>null);
  for(let i=0;i<64;i++){if(!isDarkSquare(i))continue;if(rank(i)<3)board[i]={p:1,king:false};if(rank(i)>4)board[i]={p:0,king:false}}
  return {board,turn:0,chain:null,chainRemaining:undefined,over:false,winner:null,lastMove:null};
 },
 validateMove(s,m){return legalMoves(s).some(x=>x.from===m.from&&x.to===m.to&&JSON.stringify(x.path??[x.to])===JSON.stringify(m.path??[m.to])&&JSON.stringify(x.capturedPieces??[])===JSON.stringify(m.capturedPieces??(m.captured===undefined?[]:[m.captured])))},
 applyMove(s,m){if(!checkersEngine.validateMove(s,m))return s;const n=clone(s),p=n.board[m.from]!;
  n.board[m.from]=null;n.board[m.to]=p;const taken=m.capturedPieces??(m.captured===undefined?[]:[m.captured]);for(const x of taken)n.board[x]=null;
  if(!p.king&&rank(m.to)===(p.p===0?0:7))p.king=true;
  n.chain=null;n.chainRemaining=undefined;n.turn=s.turn===0?1:0;
  n.lastMove={...m,path:[...(m.path??[m.to])],capturedPieces:[...taken]};
  if(n.board.filter(x=>x&&x.p===n.turn).length===0||legalMoves(n).length===0){n.over=true;n.winner=n.turn===0?1:0}
  return n;
 },getState:s=>s,isGameOver:s=>s.over,getWinner:s=>s.winner,legalMoves
};
