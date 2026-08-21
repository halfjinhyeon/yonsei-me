/**
 * GPU 가속이 꺼진 브라우저를 부팅 시점에 판정해 <html> 에 `perf-lite` 를 붙인다.
 *
 * 왜 필요한가: Chrome 설정에서 "가능한 경우 하드웨어 가속 사용"을 끄면 합성이
 * 소프트웨어 래스터(SwiftShader/WARP)로 떨어진다. 이때 메가메뉴의
 * `backdrop-filter: blur(20px)` 은 전폭 시트 뒤 배경을 CPU 가우시안 블러로 매 프레임
 * 다시 계산해 열고 닫는 200ms 전이가 눈에 띄게 끊긴다.
 * 실측(--disable-gpu 헤드리스, CPU 4x 스로틀, 1.4초 창, 5회 반복):
 *   현행        32ms 초과 프레임 7개 (5회 모두 7, 최대 프레임 33~50ms)
 *   블러 해제   32ms 초과 프레임 0개 (5회 모두 0, 최대 프레임 17ms)
 * CSS 미디어 쿼리로는 GPU 유무를 알 수 없어 런타임 판정이 유일한 방법이다.
 *
 * 판정 방법: WebGL 렌더러 문자열. 하드웨어 가속이 꺼지면 여기에 SwiftShader /
 * llvmpipe / Microsoft Basic Render Driver 같은 소프트웨어 래스터라이저 이름이 뜬다.
 * WebGL 컨텍스트 생성 자체가 소프트웨어에선 수십 ms 들 수 있어 결과를 localStorage 에
 * 캐시하고, 사용자가 나중에 설정을 바꿀 수 있으므로 7일이 지나면 다시 판정한다.
 *
 * body 최상단에서 동기 실행 — 헤더 마크업이 파싱되기 전에 클래스가 붙어야
 * 블러가 한 프레임도 그려지지 않는다.
 */
const SCRIPT = `(function(){try{
var d=document.documentElement,K='perf-lite:v1',W=6048e5,now=Date.now(),c=null;
try{c=JSON.parse(localStorage.getItem(K)||'null')}catch(e){}
if(c&&now-c.t<W){if(c.s){d.classList.add('perf-lite')}return}
var soft=false;
try{
var g=document.createElement('canvas').getContext('webgl')||document.createElement('canvas').getContext('experimental-webgl');
if(!g){soft=true}else{
var x=g.getExtension('WEBGL_debug_renderer_info');
var r=x?String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)):'';
soft=!r||/swiftshader|llvmpipe|softpipe|basic render|generic renderer|software|microsoft basic/i.test(r);
var lc=g.getExtension('WEBGL_lose_context');if(lc){lc.loseContext()}}
}catch(e){soft=true}
if(soft){d.classList.add('perf-lite')}
try{localStorage.setItem(K,JSON.stringify({s:soft?1:0,t:now}))}catch(e){}
}catch(e){}})();`;

export function PerfLiteScript() {
  // 자체 생성 정적 문자열(사용자 입력 미포함) — XSS 벡터 없음
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
