/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { FileUpload } from "./components/FileUpload";
import { Button } from "./components/Button";
import { Loader2, Download, Cpu, Zap, Shield, Swords, Terminal, FileText, Clock, RotateCcw, Trash2, CheckCircle2 } from "lucide-react";
import { cn } from "./lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { EXAMPLE_CMD, EXAMPLE_CNS } from "./lib/exampleData";

interface AIVersion {
  id: string;
  name: string;
  timestamp: number;
  cmdContent: string;
  cnsContent: string;
  defensiveLevel: number;
  spamLevel: number;
  customInstructions: string;
}

export default function App() {
  const [cnsFile, setCnsFile] = useState<File | null>(null);
  const [cmdFile, setCmdFile] = useState<File | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [defensiveLevel, setDefensiveLevel] = useState(1);
  const [spamLevel, setSpamLevel] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [resultZip, setResultZip] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<AIVersion[]>([]);
  const [aiVar, setAiVar] = useState(59);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [compareVersions, setCompareVersions] = useState<[AIVersion, AIVersion] | null>(null);
  const [generatedCmd, setGeneratedCmd] = useState("");
  const [generatedCns, setGeneratedCns] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);

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
      addLog("Reading file contents...");
      const cnsContent = await cnsFile.text();
      const cmdContent = await cmdFile.text();
      
      setProgress(30);
      addLog("Initializing Neural Network (Gemini 3 Flash)...");

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = `
You are an expert M.U.G.E.N AI developer.
I will provide the content of a .cmd (Command) file and a .cns (Constants) file for a character.

YOUR GOAL:
Generate *new* AI code blocks to be INJECTED into these files.
The AI should be "God Tier" (highly competitive).

TECHNICAL REQUIREMENTS:
- AI VARIABLE: Use var(${aiVar}) to track AI status. 1 = AI ON, 0 = AI OFF.
- COMPATIBILITY: Ensure the code works in both M.U.G.E.N and Ikemen GO.

USER PREFERENCES:
- DEFENSIVE LEVEL: ${defensiveLevel}/10. (1 = Standard defense, 10 = Impossible to hit, frame-perfect blocking and evasion).
- SPAM/AGGRESSION LEVEL: ${spamLevel}/10. (1 = Balanced offense, 10 = Relentless spamming of specials/supers, zero idle time).

USER CUSTOM INSTRUCTIONS:
${customInstructions ? customInstructions : "No specific custom instructions provided."}

CRITICAL TECHNICAL INSTRUCTIONS (TO PREVENT CRASHES):
1. **CMD FILE**:
   - The user's CMD file already has a \`[Statedef -1]\`.
   - DO NOT output \`[Statedef -1]\` in your response.
   - Output ONLY the \`[State -1, ...]\` blocks that act as AI triggers.
   - Use \`triggerall = var(${aiVar}) = 1\` for all your new states.
   - Ensure all \`ChangeState\` or \`SelfState\` calls use valid state IDs.

2. **CNS FILE**:
   - Output ONLY the \`[State -2, ...]\` or \`[State -3, ...]\` blocks for AI activation and logic.
   - DO NOT output the \`[Statedef -2]\` or \`[Statedef -3]\` headers themselves.
   - Include a block to set \`var(${aiVar}) = 1\` when the match starts and the character is AI-controlled.
   - If you need helper states, use safe, high State IDs (e.g., \`[Statedef 9700]\`) and output the full block for those.

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
      addLog(loadingMessages[0]);
      
      intervalId = setInterval(() => {
        msgIndex++;
        if (msgIndex < loadingMessages.length) {
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
        setGeneratedCns(cnsInjection + (cnsHelpers ? "\n\n" + cnsHelpers : ""));
        setVersionName(`AI Build #${versions.length + 1}`);
        
        addLog("Code generated. Opening preview for review...");
        setIsPreviewOpen(true);
        setProgress(80);
        setIsProcessing(false);

    } catch (err: any) {
      clearInterval(intervalId);
      console.error(err);
      setError(err.message || "An error occurred during generation.");
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
    
    // Re-generate ZIP for this version
    const zip = new JSZip();
    zip.file("ai_enhanced.cmd", version.cmdContent);
    zip.file("ai_enhanced.cns", version.cnsContent);
    zip.file("readme_ai.txt", "AI Generated by M.U.G.E.N AI Enhancer\n\nRestored from version: " + version.name);
    
    zip.generateAsync({ type: "blob" }).then((content) => {
      setResultZip(content);
      addLog(`Restored version: ${version.name}`);
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

      // 1. Inject CMD triggers into [Statedef -1]
      let newCmdContent = cmdContent;
      const statedefRegex = /\[Statedef\s+-1\]/i;
      const match = newCmdContent.match(statedefRegex);
      
      if (match && match.index !== undefined) {
        const insertionPoint = match.index + match[0].length;
        newCmdContent = 
          newCmdContent.slice(0, insertionPoint) + 
          "\n\n; --- AI GENERATED TRIGGERS START ---\n" + 
          generatedCmd + 
          "\n; --- AI GENERATED TRIGGERS END ---\n" + 
          newCmdContent.slice(insertionPoint);
      } else {
        addLog("Warning: [Statedef -1] not found in CMD. Appending to end.");
        newCmdContent += "\n\n[Statedef -1]\n" + generatedCmd;
      }

      // 2. Inject CNS states
      let newCnsContent = cnsContent;
      const cnsStatedefRegex = /\[Statedef\s+-2\]|\[Statedef\s+-3\]/i;
      const cnsMatch = newCnsContent.match(cnsStatedefRegex);
      
      if (cnsMatch && cnsMatch.index !== undefined) {
        const insertionPoint = cnsMatch.index + cnsMatch[0].length;
        newCnsContent = 
          newCnsContent.slice(0, insertionPoint) + 
          "\n\n; --- AI GENERATED STATES START ---\n" + 
          generatedCns + 
          "\n; --- AI GENERATED STATES END ---\n" + 
          newCnsContent.slice(insertionPoint);
      } else {
        addLog("Warning: [Statedef -2] or [-3] not found in CNS. Appending to end.");
        newCnsContent += "\n\n[Statedef -2]\n" + generatedCns;
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
                The variable used to track AI status. Default is 59. Ensure this variable is not used by the character.
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
              {resultZip && (
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
            
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}
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
                  <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleApplyEdits} className="bg-emerald-600 hover:bg-emerald-500">
                    Apply & Save
                  </Button>
                </div>
              </div>

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
                    className="flex-1 bg-zinc-950 p-4 font-mono text-xs text-blue-400/80 focus:outline-none resize-none selection:bg-blue-500/20"
                    value={generatedCns}
                    onChange={(e) => setGeneratedCns(e.target.value)}
                    spellCheck={false}
                  />
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

