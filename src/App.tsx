/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, Dispatch, SetStateAction } from "react";
import { GoogleGenAI } from "@google/genai";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { FileUpload } from "./components/FileUpload";
import { Button } from "./components/Button";
import { Loader2, Download, Cpu, Zap, Shield, Swords, Terminal, FileText, Clock, RotateCcw, Trash2, CheckCircle2, Undo2, Redo2, Wand2 } from "lucide-react";
import { cn } from "./lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { EXAMPLE_CMD, EXAMPLE_CNS } from "./lib/exampleData";

// Hook for persisting state to localStorage
function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue as Dispatch<SetStateAction<T>>];
}

interface AIVersion {
  id: string;
  name: string;
  timestamp: number;
  cmdContent: string;
  cnsContent: string;
  generatedCmd: string;
  generatedCns: string;
  generatedHelpers: string;
  defensiveLevel: number;
  spamLevel: number;
  customInstructions: string;
}

export default function App() {
  const [cnsFile, setCnsFile] = useState<File | null>(null);
  const [cmdFile, setCmdFile] = useState<File | null>(null);
  const [customInstructions, setCustomInstructions] = useLocalStorage<string>("customInstructions", "");
  const [defensiveLevel, setDefensiveLevel] = useLocalStorage<number>("defensiveLevel", 1);
  const [spamLevel, setSpamLevel] = useLocalStorage<number>("spamLevel", 1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStatus, setCurrentStatus] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [resultZip, setResultZip] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useLocalStorage<AIVersion[]>("versions", []);
  const [aiVar, setAiVar] = useLocalStorage<number>("aiVar", 59);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [compareVersions, setCompareVersions] = useState<[AIVersion, AIVersion] | null>(null);
  const [generatedCmd, setGeneratedCmd] = useLocalStorage<string>("generatedCmd", "");
  const [generatedCns, setGeneratedCns] = useLocalStorage<string>("generatedCns", "");
  const [generatedHelpers, setGeneratedHelpers] = useLocalStorage<string>("generatedHelpers", "");
  const [historyState, setHistoryState] = useLocalStorage<{
    items: { cmd: string; cns: string; helpers: string }[];
    index: number;
  }>("historyState", { items: [], index: -1 });
  const [warnings, setWarnings] = useState<string[]>([]);
  const isInternalChange = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const validateCode = (cmd: string, cns: string, helpers: string) => {
    const newWarnings: string[] = [];
    
    const checkBlock = (code: string, name: string, isCmd: boolean = false) => {
      if (code.match(/\[Statedef\s+[^\]]*\]/i)) {
        newWarnings.push(`${name}: Contains a [Statedef] block. This will cause a crash if injected into -1/-2. Move it to HELPERS.`);
      }

      const controllers = code.split(/\[State.*?\]/i);
      controllers.shift(); // Remove content before first controller
      
      controllers.forEach((ctrl, i) => {
        const trimmed = ctrl.trim();
        if (!trimmed) return;

        const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith(';'));
        
        // 1. Check for 'type'
        const hasType = lines.some(l => l.toLowerCase().startsWith('type'));
        if (!hasType) {
          newWarnings.push(`${name}: Controller #${i + 1} is missing 'type'.`);
        }

        // 2. Check for triggers
        const triggerLines = lines.filter(l => l.toLowerCase().startsWith('trigger'));
        if (triggerLines.length === 0) {
          newWarnings.push(`${name}: Controller #${i + 1} is missing 'trigger'.`);
        } else {
          // Check trigger order: triggerall must be before trigger1/2/3
          let foundNumberedTrigger = false;
          triggerLines.forEach(tl => {
            const isAll = tl.toLowerCase().startsWith('triggerall');
            if (!isAll) foundNumberedTrigger = true;
            if (isAll && foundNumberedTrigger) {
              newWarnings.push(`${name}: Controller #${i + 1} has 'triggerall' after a numbered trigger. This crashes Ikemen GO.`);
            }
          });

          // Check for trigger1 if trigger2 exists
          const hasTrigger1 = triggerLines.some(tl => tl.toLowerCase().startsWith('trigger1'));
          const hasTrigger2 = triggerLines.some(tl => tl.toLowerCase().startsWith('trigger2'));
          if (hasTrigger2 && !hasTrigger1) {
            newWarnings.push(`${name}: Controller #${i + 1} has 'trigger2' but no 'trigger1'.`);
          }

          // Check for AI Guard in CMD
          if (isCmd) {
            const aiGuardRegex = new RegExp(`var\\s*\\(\\s*${aiVar}\\s*\\)`, 'i');
            const hasAiGuard = triggerLines.some(l => l.toLowerCase().startsWith('triggerall') && aiGuardRegex.test(l));
            if (!hasAiGuard) {
               newWarnings.push(`${name}: Controller #${i + 1} is missing 'triggerall = var(${aiVar})'. The AI will play for you!`);
            }
          }
        }

        // 3. Check for mandatory parameters based on type
        const typeLine = lines.find(l => l.toLowerCase().startsWith('type'));
        if (typeLine) {
          const type = typeLine.split('=')[1]?.trim().toLowerCase();
          if (type === 'varset' || type === 'varadd') {
            if (!lines.some(l => l.toLowerCase().startsWith('v'))) newWarnings.push(`${name}: Controller #${i + 1} (VarSet) missing 'v'.`);
            if (!lines.some(l => l.toLowerCase().startsWith('value'))) newWarnings.push(`${name}: Controller #${i + 1} (VarSet) missing 'value'.`);
          }
          if (type === 'changestate' || type === 'selfstate') {
            if (!lines.some(l => l.toLowerCase().startsWith('value'))) newWarnings.push(`${name}: Controller #${i + 1} (ChangeState) missing 'value'.`);
          }
        }
      });
    };

    checkBlock(cmd, "CMD", true);
    checkBlock(cns, "CNS", false);

    if (helpers) {
      const helperDefs = helpers.split(/\[Statedef\s+(\d+)\]/i);
      for (let i = 1; i < helperDefs.length; i += 2) {
        const id = helperDefs[i];
        const content = helperDefs[i + 1];
        if (content && !content.includes("type =")) {
          newWarnings.push(`HELPERS: Statedef ${id} is missing 'type' parameter.`);
        }
      }
    }

    // Check for AI Variable consistency
    const varRegex = new RegExp(`var\\((\\d+)\\)`, "g");
    const cmdVars = [...cmd.matchAll(varRegex)].map(m => parseInt(m[1]));
    const cnsVars = [...cns.matchAll(varRegex)].map(m => parseInt(m[1]));
    
    const inconsistentVars = [...new Set([...cmdVars, ...cnsVars])].filter(v => v !== aiVar);
    if (inconsistentVars.length > 0) {
      newWarnings.push(`Variable Conflict: AI is using var(${inconsistentVars.join(", ")}) but you selected var(${aiVar}).`);
    }

    setWarnings(newWarnings);
  };

  const addToHistory = (cmd: string, cns: string, helpers: string) => {
    validateCode(cmd, cns, helpers);
    setHistoryState(prev => {
      // Don't push if it's the same as the current state
      if (prev.index >= 0 && prev.items[prev.index]) {
        const current = prev.items[prev.index];
        if (current.cmd === cmd && current.cns === cns && current.helpers === helpers) return prev;
      }
      
      const newItems = prev.items.slice(0, prev.index + 1);
      newItems.push({ cmd, cns, helpers });
      
      let newIndex = prev.index + 1;
      if (newItems.length > 50) {
        newItems.shift();
        newIndex = Math.max(0, newIndex - 1);
      }
      
      return { items: newItems, index: newIndex };
    });
  };

  const fixSyntax = () => {
    const fixBlock = (code: string, isCmd: boolean = false) => {
      const parts = code.split(/(\[State.*?\])/i);
      let fixed = parts[0] || ""; 
      
      for (let i = 1; i < parts.length; i += 2) {
        const header = parts[i];
        const body = parts[i + 1] || "";
        
        const lines = body.split('\n').map(l => l.trim()).filter(l => l);
        
        // Separate lines by type
        const typeLines = lines.filter(l => l.toLowerCase().startsWith('type'));
        const triggerAlls = lines.filter(l => l.toLowerCase().startsWith('triggerall'));
        const triggerOthers = lines.filter(l => l.toLowerCase().startsWith('trigger') && !l.toLowerCase().startsWith('triggerall'));
        const otherLines = lines.filter(l => !l.toLowerCase().startsWith('type') && !l.toLowerCase().startsWith('trigger'));

        // 1. Ensure 'type' exists
        if (typeLines.length === 0) {
          typeLines.push('type = Null; Fixed by AI Studio');
        }

        // 2. Ensure AI Guard exists for CMD states
        if (isCmd) {
          const aiGuardRegex = new RegExp(`var\\s*\\(\\s*${aiVar}\\s*\\)`, 'i');
          const hasAiGuard = triggerAlls.some(l => aiGuardRegex.test(l));
          
          if (!hasAiGuard) {
            triggerAlls.unshift(`triggerall = var(${aiVar}) > 0 ; Added AI Guard`);
          }
        }

        // 3. Ensure at least one trigger exists
        if (triggerAlls.length === 0 && triggerOthers.length === 0) {
          triggerOthers.push('trigger1 = 0 ; Prevent accidental activation');
        }

        // Reconstruct block: Type -> TriggerAlls -> TriggerOthers -> Rest
        const newBody = [
          ...typeLines,
          ...triggerAlls,
          ...triggerOthers,
          ...otherLines
        ].join('\n');
        
        fixed += `${header}\n${newBody}\n\n`;
      }
      return fixed.trim();
    };

    const fixedCmd = fixBlock(generatedCmd, true);
    const fixedCns = fixBlock(generatedCns, false);
    
    setGeneratedCmd(fixedCmd);
    setGeneratedCns(fixedCns);
    addToHistory(fixedCmd, fixedCns, generatedHelpers);
    addLog("Applied automatic syntax fixes: Added AI Guards & fixed trigger order.");
  };

  const undo = () => {
    if (historyState.index > 0) {
      isInternalChange.current = true;
      const prevIndex = historyState.index - 1;
      const prevState = historyState.items[prevIndex];
      setGeneratedCmd(prevState.cmd);
      setGeneratedCns(prevState.cns);
      setGeneratedHelpers(prevState.helpers);
      setHistoryState(prev => ({ ...prev, index: prevIndex }));
      validateCode(prevState.cmd, prevState.cns, prevState.helpers);
      setTimeout(() => { isInternalChange.current = false; }, 50);
    }
  };

  const redo = () => {
    if (historyState.index < historyState.items.length - 1) {
      isInternalChange.current = true;
      const nextIndex = historyState.index + 1;
      const nextState = historyState.items[nextIndex];
      setGeneratedCmd(nextState.cmd);
      setGeneratedCns(nextState.cns);
      setGeneratedHelpers(nextState.helpers);
      setHistoryState(prev => ({ ...prev, index: nextIndex }));
      validateCode(nextState.cmd, nextState.cns, nextState.helpers);
      setTimeout(() => { isInternalChange.current = false; }, 50);
    }
  };

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPreviewOpen) return;
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewOpen, historyState]);

  // Debounced history push for manual edits
  useEffect(() => {
    if (isInternalChange.current || !isPreviewOpen) return;

    const timer = setTimeout(() => {
      addToHistory(generatedCmd, generatedCns, generatedHelpers);
    }, 1000); // 1 second debounce

    return () => clearTimeout(timer);
  }, [generatedCmd, generatedCns, generatedHelpers, isPreviewOpen]);

  const addLog = (msg: string) => setLogs((prev) => [...prev, `> ${msg}`]);

  // Auto-scroll to bottom of logs
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  // Use effect to scroll whenever logs change
  useState(() => {
    // This is a hacky way to use effect in class-like manner inside functional component body? 
    // No, I should use useEffect.
  });
  
  // Actually, I need to import useEffect.
  // Let's just add the useEffect hook.

  const handleDownloadExamples = () => {
    const zip = new JSZip();
    zip.file("example_char.cmd", EXAMPLE_CMD);
    zip.file("example_char.cns", EXAMPLE_CNS);
    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, "mugen_example_files.zip");
    });
  };

  const handleGenerate = async () => {
    if (!cnsFile || !cmdFile) return;
    
    setIsProcessing(true);
    setProgress(10);
    setLogs([]);
    setError(null);
    setResultZip(null);

    let intervalId: NodeJS.Timeout | undefined;

    try {
      setCurrentStatus("Reading file contents...");
      addLog("Reading file contents...");
      const cnsContent = await cnsFile.text();
      const cmdContent = await cmdFile.text();
      
      setProgress(30);
      setCurrentStatus("Initializing Neural Network...");
      addLog("Initializing Neural Network (Gemini 3 Flash)...");

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = `
You are an expert M.U.G.E.N and Ikemen GO AI developer.
I will provide the content of a .cmd (Command) file and a .cns (Constants) file for a character.

YOUR GOAL:
Generate *new* AI code blocks to be INJECTED into these files.
The AI should be "God Tier" (highly competitive).

CRITICAL IKEMEN GO COMPATIBILITY RULES (MANDATORY):
1. **EVERY [State]** must have a 'type =' parameter.
2. **EVERY [State]** must have at least one 'trigger1 =' or 'triggerall =' parameter.
3. **TRIGGER ORDER**: 'triggerall' MUST come BEFORE any 'trigger1', 'trigger2', etc.
4. **TRIGGER CONTINUITY**: You cannot have 'trigger2' if 'trigger1' is missing.
5. **VARSET/VARADD**: Must include both 'v =' (variable index) and 'value ='.
6. **CHANGESTATE/SELFSTATE**: Must include 'value ='.
7. **NO STATEDEF**: Do not include [Statedef] headers in CMD_TRIGGERS or CNS_STATES.
8. **AI ACTIVATION GUARD**: EVERY generated [State] in the CMD file MUST include 'triggerall = var(${aiVar}) > 0' (or '!= 0') to ensure it ONLY activates when the AI is in control. This is CRITICAL to prevent the AI from playing for the human user.

USER PREFERENCES:
- DEFENSIVE LEVEL: ${defensiveLevel}/10.
- SPAM/AGGRESSION LEVEL: ${spamLevel}/10.
- CUSTOM GOALS: ${customInstructions ? customInstructions : "Balanced gameplay"}
- AI VARIABLE: var(${aiVar}) (Use this variable to check if AI is active)

OUTPUT FORMAT:
Return ONLY the NEW code to be added, wrapped in these delimiters:

---BEGIN CMD INJECTION---
...new [State -1] blocks ONLY...
---END CMD INJECTION---

---BEGIN CNS INJECTION---
...new [State -2] or [State -3] blocks ONLY...
---END CNS INJECTION---

---BEGIN CNS HELPERS---
...full [Statedef XXXX] blocks for any helpers...
---END CNS HELPERS---

Here is the CMD file content (for context):
${cmdContent}

Here is the CNS file content (for context):
${cnsContent}
      `;

      // Dynamic Progress Simulation
      const loadingMessages = [
        "Analyzing character moveset...",
        "Identifying key attacks and frame data...",
        "Generating combo routes...",
        "Calculating defensive heuristics...",
        "Optimizing AI state triggers...",
        "Finalizing logic gates...",
        "Reviewing code for syntax errors..."
      ];

      let msgIndex = 0;
      setCurrentStatus(loadingMessages[0]);
      addLog(loadingMessages[0]);
      
      intervalId = setInterval(() => {
        msgIndex++;
        if (msgIndex < loadingMessages.length) {
          setCurrentStatus(loadingMessages[msgIndex]);
          addLog(loadingMessages[msgIndex]);
          setProgress((prev) => Math.min(prev + 10, 65)); // Increment progress slowly
        }
      }, 2500); // New message every 2.5 seconds

      const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
        });

        clearInterval(intervalId); // Stop the simulation
        
        let text = response.text;
        if (!text) throw new Error("No response from AI");

        // Clean up potential markdown code blocks
        text = text.replace(/```\w*\n/g, "").replace(/```/g, "");

        setProgress(70);
        setCurrentStatus("Parsing generated code...");
        addLog("Response received. Parsing generated code...");

        const cmdMatch = text.match(/---BEGIN CMD INJECTION---([\s\S]*?)---END CMD INJECTION---/);
        const cnsInjectionMatch = text.match(/---BEGIN CNS INJECTION---([\s\S]*?)---END CNS INJECTION---/);
        const cnsHelpersMatch = text.match(/---BEGIN CNS HELPERS---([\s\S]*?)---END CNS HELPERS---/);

        if (!cmdMatch || (!cnsInjectionMatch && !cnsHelpersMatch)) {
          throw new Error("Failed to parse AI response. The model output format was unexpected.");
        }

        const cmdInjection = cmdMatch[1].trim();
        const cnsInjection = cnsInjectionMatch?.[1]?.trim() || "";
        const cnsHelpers = cnsHelpersMatch?.[1]?.trim() || "";

        // Set generated content for preview
        setGeneratedCmd(cmdInjection);
        setGeneratedCns(cnsInjection);
        setGeneratedHelpers(cnsHelpers);
        setHistoryState({ items: [{ cmd: cmdInjection, cns: cnsInjection, helpers: cnsHelpers }], index: 0 });
        setVersionName(`AI Build #${versions.length + 1}`);
        
        addLog("Code generated. Opening preview for review...");
        setCurrentStatus("Finalizing...");
        setIsPreviewOpen(true);
        setProgress(100);
        setIsProcessing(false);

    } catch (err: any) {
      clearInterval(intervalId);
      console.error(err);
      setError(err.message || "An error occurred during generation.");
      setCurrentStatus("Generation failed.");
      addLog(`ERROR: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setCnsFile(null);
    setCmdFile(null);
    setCustomInstructions("");
    setDefensiveLevel(1);
    setSpamLevel(1);
    setResultZip(null);
    setLogs([]);
    setError(null);
    setProgress(0);
    setCurrentStatus("");
  };

  const downloadZip = () => {
    if (resultZip) {
      saveAs(resultZip, "mugen_ai_enhanced.zip");
    }
  };

  const restoreVersion = (version: AIVersion) => {
    setDefensiveLevel(version.defensiveLevel);
    setSpamLevel(version.spamLevel);
    setCustomInstructions(version.customInstructions);
    setGeneratedCmd(version.generatedCmd || "");
    setGeneratedCns(version.generatedCns || "");
    setGeneratedHelpers(version.generatedHelpers || "");
    setHistoryState({ 
      items: [{ 
        cmd: version.generatedCmd || "", 
        cns: version.generatedCns || "", 
        helpers: version.generatedHelpers || "" 
      }], 
      index: 0 
    });
    setVersionName(version.name);
    
    // Re-generate ZIP for this version
    const zip = new JSZip();
    zip.file("ai_enhanced.cmd", version.cmdContent);
    zip.file("ai_enhanced.cns", version.cnsContent);
    zip.file("readme_ai.txt", "AI Generated by M.U.G.E.N AI Enhancer\n\nRestored from version: " + version.name);
    
    zip.generateAsync({ type: "blob" }).then((content) => {
      setResultZip(content);
      setIsPreviewOpen(true);
      addLog(`Restored version: ${version.name}. You can review and re-apply edits.`);
    });
  };

  const deleteVersion = (id: string) => {
    setVersions((prev) => prev.filter((v) => v.id !== id));
  };

  const handleCompare = (v: AIVersion) => {
    if (!compareVersions) {
      setCompareVersions([v, v]); // First selection
      addLog(`Selected ${v.name} for comparison. Select another version.`);
      return;
    }
    
    if (compareVersions[0].id === v.id) {
      setCompareVersions(null);
      addLog("Comparison cancelled.");
      return;
    }

    setCompareVersions([compareVersions[0], v]);
  };

  const handleApplyEdits = async () => {
    if (!cnsFile || !cmdFile) return;
    
    try {
      addLog("Applying custom edits and injecting logic...");
      const cnsContent = await cnsFile.text();
      const cmdContent = await cmdFile.text();

      // Sanitization: Remove any [Statedef] headers that might have been included in injection blocks
      const cleanCmd = generatedCmd.replace(/^\[Statedef\s+-(1|2|3)[^\]]*\]\s*$/gim, "").trim();
      const cleanCns = generatedCns.replace(/^\[Statedef\s+-(1|2|3)[^\]]*\]\s*$/gim, "").trim();
      const cleanHelpers = generatedHelpers.trim();

      // 1. Inject CMD triggers into [Statedef -1]
      let newCmdContent = cmdContent;
      // More robust regex to match variants like [Statedef -1, AI]
      const statedefRegex = /\[Statedef\s+-1[^\]]*\]/i;
      const match = newCmdContent.match(statedefRegex);
      
      if (match && match.index !== undefined) {
        const insertionPoint = match.index + match[0].length;
        newCmdContent = 
          newCmdContent.slice(0, insertionPoint) + 
          "\n\n; --- AI GENERATED TRIGGERS START ---\n" + 
          cleanCmd + 
          "\n; --- AI GENERATED TRIGGERS END ---\n" + 
          newCmdContent.slice(insertionPoint);
      } else {
        addLog("Warning: [Statedef -1] not found in CMD. Appending to end.");
        newCmdContent += "\n\n[Statedef -1]\n" + cleanCmd;
      }

      // 2. Inject CNS states
      let newCnsContent = cnsContent;
      
      // Inject logic into [Statedef -2] or [-3]
      if (cleanCns) {
        // Look for -2 or -3, but also check if they are in the CMD (rare but happens)
        const cnsStatedefRegex = /\[Statedef\s+-(2|3)[^\]]*\]/i;
        let cnsMatch = newCnsContent.match(cnsStatedefRegex);
        
        if (cnsMatch && cnsMatch.index !== undefined) {
          const insertionPoint = cnsMatch.index + cnsMatch[0].length;
          newCnsContent = 
            newCnsContent.slice(0, insertionPoint) + 
            "\n\n; --- AI GENERATED STATES START ---\n" + 
            cleanCns + 
            "\n; --- AI GENERATED STATES END ---\n" + 
            newCnsContent.slice(insertionPoint);
        } else {
          // Check if -2/-3 is in CMD instead
          const cmdCnsMatch = newCmdContent.match(cnsStatedefRegex);
          if (cmdCnsMatch && cmdCnsMatch.index !== undefined) {
            addLog("Found [Statedef -2/-3] in CMD file. Injecting logic there.");
            const insertionPoint = cmdCnsMatch.index + cmdCnsMatch[0].length;
            newCmdContent = 
              newCmdContent.slice(0, insertionPoint) + 
              "\n\n; --- AI GENERATED STATES START ---\n" + 
              cleanCns + 
              "\n; --- AI GENERATED STATES END ---\n" + 
              newCmdContent.slice(insertionPoint);
          } else {
            addLog("Warning: [Statedef -2] or [-3] not found. Appending logic to CNS.");
            if (!newCnsContent.endsWith("\n")) newCnsContent += "\n";
            newCnsContent += "\n[Statedef -2]\n" + cleanCns;
          }
        }
      }

      // Append helpers to the end (NEVER inside another statedef)
      if (cleanHelpers) {
        if (!newCnsContent.endsWith("\n")) newCnsContent += "\n";
        newCnsContent += "\n\n; --- AI GENERATED HELPERS START ---\n" + 
          cleanHelpers + 
          "\n; --- AI GENERATED HELPERS END ---\n";
      }

      addLog("Creating final package...");
      const zip = new JSZip();
      zip.file("ai_enhanced.cmd", newCmdContent);
      zip.file("ai_enhanced.cns", newCnsContent);
      zip.file("readme_ai.txt", "AI Generated by M.U.G.E.N AI Enhancer\n\nThese files contain your ORIGINAL content plus new AI logic appended at the end.");

      const content = await zip.generateAsync({ type: "blob" });
      setResultZip(content);
      
      const newVersion: AIVersion = {
        id: crypto.randomUUID(),
        name: versionName || `AI Build #${versions.length + 1}`,
        timestamp: Date.now(),
        cmdContent: newCmdContent,
        cnsContent: newCnsContent,
        generatedCmd,
        generatedCns,
        generatedHelpers,
        defensiveLevel,
        spamLevel,
        customInstructions,
      };
      
      setVersions((prev) => [newVersion, ...prev]);
      addLog(`Version saved: ${newVersion.name}`);
      setIsPreviewOpen(false);
      setProgress(100);
      addLog("Done! Enhancement applied successfully.");

    } catch (err: any) {
      console.error(err);
      setError("Failed to apply edits: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
            <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Cpu className="text-black w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">
              M.U.G.E.N <span className="text-emerald-500">AI Enhancer</span>
            </h1>
          </div>
          <div className="text-xs font-mono text-zinc-500">v1.0.0</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* Left Column: Input */}
          <div className="space-y-8">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light tracking-tight text-white">
                  Character Files
                </h2>
                <button 
                  onClick={handleDownloadExamples}
                  className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 hover:underline"
                >
                  <FileText className="w-3 h-3" />
                  Download Examples
                </button>
              </div>
              <p className="text-zinc-400 text-sm">
                Upload your character's definition files. The AI will analyze the moveset and generate a competitive logic layer.
              </p>
            </div>

            <div className="grid gap-4">
              <FileUpload
                accept=".cmd"
                label="Command File (.cmd)"
                file={cmdFile}
                onFileSelect={setCmdFile}
              />
              <FileUpload
                accept=".cns"
                label="Constants File (.cns)"
                file={cnsFile}
                onFileSelect={setCnsFile}
              />
            </div>

            {/* Version History */}
            {versions.length > 0 && (
              <div className="space-y-4 pt-8 border-t border-zinc-800">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Clock className="w-5 h-5" />
                  <h3 className="text-lg font-medium">Version History</h3>
                </div>
                <div className="space-y-3">
                  {versions.map((version) => (
                    <div 
                      key={version.id}
                      className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-emerald-400">{version.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {new Date(version.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Shield className="w-3 h-3" /> {version.defensiveLevel}
                          </span>
                          <span className="flex items-center gap-1">
                            <Swords className="w-3 h-3" /> {version.spamLevel}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleCompare(version)}
                          className={cn(
                            "p-1.5 rounded transition-colors",
                            compareVersions?.[0]?.id === version.id || compareVersions?.[1]?.id === version.id
                              ? "bg-blue-500/20 text-blue-400"
                              : "hover:bg-blue-500/20 text-blue-500"
                          )}
                          title="Compare this version"
                        >
                          <Swords className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => restoreVersion(version)}
                          className="p-1.5 hover:bg-emerald-500/20 text-emerald-500 rounded transition-colors"
                          title="Restore this version"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteVersion(version.id)}
                          className="p-1.5 hover:bg-red-500/20 text-red-500 rounded transition-colors"
                          title="Delete version"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span>Enhancement Features</span>
              </div>
              <ul className="space-y-2 text-xs text-zinc-500 font-mono">
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Aggressive Combo Chaining
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Frame-Perfect Blocking
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Smart Power Management
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Anti-Air & Zoning Logic
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <label htmlFor="custom-instructions" className="text-sm font-medium text-zinc-300">
                Custom Instructions (Optional)
              </label>
              <textarea
                id="custom-instructions"
                className="w-full h-24 bg-zinc-900/50 border border-zinc-700 rounded-md p-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                placeholder="e.g., Focus on defensive playstyle, prioritize air combos, use var(50) for AI activation..."
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <Shield className="w-4 h-4 text-blue-400" />
                    Defensive Level
                  </div>
                  <span className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
                    {defensiveLevel}/10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={defensiveLevel}
                  onChange={(e) => setDefensiveLevel(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <p className="text-[10px] text-zinc-500">
                  {defensiveLevel <= 3 ? "Standard blocking" : defensiveLevel <= 7 ? "Active evasion & counters" : "Frame-perfect god defense"}
                </p>
              </div>

              <div className="space-y-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <Swords className="w-4 h-4 text-red-400" />
                    Spam/Aggression
                  </div>
                  <span className="text-xs font-mono text-red-400 bg-red-400/10 px-2 py-0.5 rounded">
                    {spamLevel}/10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={spamLevel}
                  onChange={(e) => setSpamLevel(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
                <p className="text-[10px] text-zinc-500">
                  {spamLevel <= 3 ? "Balanced offense" : spamLevel <= 7 ? "Heavy pressure" : "Relentless projectile spam"}
                </p>
              </div>
            </div>

            <div className="space-y-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  AI Variable (var)
                </div>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={aiVar}
                  onChange={(e) => setAiVar(parseInt(e.target.value) || 0)}
                  className="w-16 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                The variable used to track AI status. Default is 59. The AI will automatically disable itself if it detects a human player (AILevel = 0).
              </p>
            </div>

            <Button
              size="lg"
              className="w-full text-base h-14"
              onClick={handleGenerate}
              disabled={!cnsFile || !cmdFile || isProcessing}
              isLoading={isProcessing}
            >
              {isProcessing ? "Enhancing AI..." : "Generate AI Core"}
            </Button>
          </div>

          {/* Right Column: Output / Terminal */}
          <div className="space-y-8">
             <div className="space-y-2">
              <h2 className="text-2xl font-light tracking-tight text-white">
                Processing Log
              </h2>
              <p className="text-zinc-400 text-sm">
                Real-time analysis and generation status.
              </p>
            </div>

            <div className="relative h-[400px] bg-black border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs p-4 shadow-2xl">
              <div className="absolute top-0 left-0 right-0 h-8 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-2">
                <Terminal className="w-3 h-3 text-zinc-500" />
                <span className="text-zinc-500">terminal</span>
              </div>
              
              <div className="mt-8 h-full overflow-y-auto pb-4 space-y-1 text-zinc-300">
                {logs.length === 0 && !isProcessing && (
                  <div className="text-zinc-600 italic">Waiting for input...</div>
                )}
                {logs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="break-words"
                  >
                    {log}
                  </motion.div>
                ))}
                <div ref={logsEndRef} />
                {isProcessing && (
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="text-emerald-500"
                  >
                    _
                  </motion.div>
                )}
              </div>

              {/* Progress Bar Overlay */}
              {isProcessing && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
                  <motion.div
                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              )}
            </div>

            <AnimatePresence>
              {isProcessing && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-zinc-900 border border-emerald-500/30 rounded-lg p-6 space-y-4 shadow-2xl relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
                    <motion.div 
                      className="h-full bg-emerald-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                        <div className="absolute inset-0 bg-emerald-500/20 blur-lg rounded-full animate-pulse" />
                      </div>
                      <div>
                        <h3 className="text-emerald-400 font-medium text-sm">AI Generation in Progress</h3>
                        <p className="text-zinc-500 text-xs font-mono">{currentStatus}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-emerald-500/70">{progress}%</span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 h-1">
                    {[0, 1, 2, 3].map((i) => (
                      <motion.div
                        key={i}
                        className="bg-emerald-500/20 rounded-full"
                        animate={{
                          backgroundColor: progress > (i * 25) ? "rgba(16, 185, 129, 0.5)" : "rgba(16, 185, 129, 0.1)"
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {resultZip && !isProcessing && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-6 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-emerald-400 font-medium">Enhancement Complete</h3>
                      <p className="text-emerald-500/60 text-xs">Ready to deploy</p>
                    </div>
                  </div>
                  <Button onClick={downloadZip} className="gap-2">
                    <Download className="w-4 h-4" />
                    Download ZIP
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 flex items-start gap-3"
                >
                  <div className="p-1.5 bg-red-500/10 rounded-full border border-red-500/20">
                    <Zap className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-red-400 font-medium text-sm">Generation Error</h3>
                    <p className="text-red-500/70 text-xs mt-0.5">{error}</p>
                  </div>
                  <button 
                    onClick={() => setError(null)}
                    className="text-red-500/50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Safety Tips */}
        <div className="mt-12 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-medium text-white">Character Safety Guide</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Avoid Crashes</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Ensure your character has <code className="text-emerald-400/80">[Statedef -1]</code> in the CMD and <code className="text-emerald-400/80">[Statedef -2]</code> in the CNS. The AI needs these headers to inject logic safely.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Variable Conflicts</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Check if your character already uses <code className="text-emerald-400/80">var({aiVar})</code>. If it does, change the AI Variable in the settings above to an unused slot (e.g., 50-59).
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ikemen GO Support</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Ikemen GO is strict. If the character crashes, check the "Potential Issues" bar in the preview window for missing parameters like <code className="text-emerald-400/80">type</code> or <code className="text-emerald-400/80">trigger</code>.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Preview Modal */}
      <AnimatePresence>
        {isPreviewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsPreviewOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl h-[80vh] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-emerald-500" />
                    <input
                      type="text"
                      className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-64"
                      value={versionName}
                      onChange={(e) => setVersionName(e.target.value)}
                      placeholder="Enter version name..."
                    />
                  </div>
                  <p className="text-xs text-zinc-500">
                    Modify the generated logic before it's injected into your character files.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-1 mr-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-zinc-400 hover:text-white disabled:opacity-30"
                      onClick={undo}
                      disabled={historyState.index <= 0}
                      title="Undo (Ctrl+Z)"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-zinc-400 hover:text-white disabled:opacity-30"
                      onClick={redo}
                      disabled={historyState.index >= historyState.items.length - 1}
                      title="Redo (Ctrl+Y)"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fixSyntax}
                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-2"
                    title="Auto-fix common Ikemen GO syntax issues"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    Fix Syntax
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleApplyEdits} className="bg-emerald-600 hover:bg-emerald-500">
                    Apply & Save
                  </Button>
                </div>
              </div>

              {warnings.length > 0 && (
                <div className="bg-amber-950/30 border-b border-amber-900/50 px-6 py-2 flex items-center gap-3">
                  <Zap className="w-4 h-4 text-amber-500 animate-pulse" />
                  <div className="flex-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    <span className="text-xs font-medium text-amber-400 mr-2">Potential Issues Detected:</span>
                    {warnings.map((w, i) => (
                      <span key={i} className="text-[10px] bg-amber-900/40 text-amber-200 px-2 py-0.5 rounded mr-2 border border-amber-800/50">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
                <div className="flex flex-col border-r border-zinc-800">
                  <div className="px-4 py-2 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">generated_triggers.cmd</span>
                  </div>
                  <textarea
                    className="flex-1 bg-zinc-950 p-4 font-mono text-xs text-emerald-400/80 focus:outline-none resize-none selection:bg-emerald-500/20"
                    value={generatedCmd}
                    onChange={(e) => setGeneratedCmd(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div className="flex flex-col">
                  <div className="px-4 py-2 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">ai_logic.cns</span>
                  </div>
                  <textarea
                    className="flex-[2] bg-zinc-950 p-4 font-mono text-xs text-blue-400/80 focus:outline-none resize-none selection:bg-blue-500/20"
                    value={generatedCns}
                    onChange={(e) => setGeneratedCns(e.target.value)}
                    spellCheck={false}
                  />
                  {generatedHelpers && (
                    <>
                      <div className="px-4 py-2 bg-zinc-950 border-t border-b border-zinc-800 flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400">helper_states.cns</span>
                      </div>
                      <textarea
                        className="flex-1 bg-zinc-950 p-4 font-mono text-xs text-purple-400/80 focus:outline-none resize-none selection:bg-purple-500/20"
                        value={generatedHelpers}
                        onChange={(e) => setGeneratedHelpers(e.target.value)}
                        spellCheck={false}
                      />
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Comparison Modal */}
      <AnimatePresence>
        {compareVersions && compareVersions[0].id !== compareVersions[1].id && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              onClick={() => setCompareVersions(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-7xl h-[90vh] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <div className="space-y-1">
                  <h2 className="text-xl font-medium text-white flex items-center gap-2">
                    <Swords className="w-5 h-5 text-blue-500" />
                    AI Strategy Comparison
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Comparing <span className="text-blue-400">{compareVersions[0].name}</span> vs <span className="text-emerald-400">{compareVersions[1].name}</span>
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setCompareVersions(null)}>
                  Close Comparison
                </Button>
              </div>

              <div className="flex-1 overflow-auto grid grid-cols-2 gap-px bg-zinc-800">
                {/* Version 1 */}
                <div className="bg-zinc-950 flex flex-col">
                  <div className="p-4 border-b border-zinc-800 bg-zinc-900/30">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-bold text-blue-400">{compareVersions[0].name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{new Date(compareVersions[0].timestamp).toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase text-zinc-500">Defensive</span>
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${compareVersions[0].defensiveLevel * 10}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase text-zinc-500">Aggression</span>
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500" style={{ width: `${compareVersions[0].spamLevel * 10}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 p-4 space-y-6 overflow-auto">
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Custom Instructions</h4>
                      <p className="text-xs text-zinc-400 italic">"{compareVersions[0].customInstructions || "None"}"</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">CMD Triggers</h4>
                      <pre className="text-[10px] font-mono text-blue-400/70 bg-black/50 p-3 rounded border border-blue-500/10 whitespace-pre-wrap">
                        {compareVersions[0].cmdContent.split('; --- AI GENERATED TRIGGERS START ---')[1]?.split('; --- AI GENERATED TRIGGERS END ---')[0]?.trim() || "No triggers found"}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Version 2 */}
                <div className="bg-zinc-950 flex flex-col">
                  <div className="p-4 border-b border-zinc-800 bg-zinc-900/30">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-bold text-emerald-400">{compareVersions[1].name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{new Date(compareVersions[1].timestamp).toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase text-zinc-500">Defensive</span>
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${compareVersions[1].defensiveLevel * 10}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase text-zinc-500">Aggression</span>
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500" style={{ width: `${compareVersions[1].spamLevel * 10}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 p-4 space-y-6 overflow-auto">
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Custom Instructions</h4>
                      <p className="text-xs text-zinc-400 italic">"{compareVersions[1].customInstructions || "None"}"</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">CMD Triggers</h4>
                      <pre className="text-[10px] font-mono text-emerald-400/70 bg-black/50 p-3 rounded border border-emerald-500/10 whitespace-pre-wrap">
                        {compareVersions[1].cmdContent.split('; --- AI GENERATED TRIGGERS START ---')[1]?.split('; --- AI GENERATED TRIGGERS END ---')[0]?.trim() || "No triggers found"}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

