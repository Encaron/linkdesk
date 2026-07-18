import { createContext, useContext } from "react";

export interface TerminalPrefs {
  timestampFormat: string;
  showEcho: boolean;
  showLineNumbers: boolean;
  separateSystemLog: boolean;
  lineEnding: string;
  autoRepeat: boolean;
  repeatInterval: number;
  autoClear: boolean;
  receiveMode: "text" | "hex";
  receiveCoding: string;
  sendMode: "text" | "hex";
  sendCoding: string;
}

export const defaultTerminalPrefs: TerminalPrefs = {
  timestampFormat: "HH:mm:ss",
  showEcho: true,
  showLineNumbers: true,
  separateSystemLog: true,
  lineEnding: "\r\n",
  autoRepeat: false,
  repeatInterval: 1000,
  autoClear: false,
  receiveMode: "text",
  receiveCoding: "UTF-8",
  sendMode: "text",
  sendCoding: "UTF-8",
};

interface TerminalPrefsContextValue {
  prefs: TerminalPrefs;
  setPrefs: (p: TerminalPrefs) => void;
}

export const TerminalPrefsContext = createContext<TerminalPrefsContextValue>({
  prefs: defaultTerminalPrefs,
  setPrefs: () => {},
});

export function useTerminalPrefs() {
  return useContext(TerminalPrefsContext);
}
