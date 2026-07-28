let _initialized = false;
function _initBad() {
  if (_initialized) return;
  _initialized = true;
  const s = (window as any).linkdesk?.serial;
  s?.onData((text: string) => console.log(text));
  s?.onStats((stats: any) => console.log(stats));
}
