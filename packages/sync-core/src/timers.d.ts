// Timers existem em todos os runtimes alvo (navegador, React Native, Node),
// mas não fazem parte da lib ES pura usada por este pacote.
declare function setInterval(handler: () => void, timeout?: number): unknown;
declare function clearInterval(id: unknown): void;
