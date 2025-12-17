import {
  Search, Bell, ArrowUp, ChevronDown, MoreHorizontal, ArrowUpRight, Flame, Video, X, Moon, Sun,
  ChevronRight
} from "lucide-react";
import { useState, useEffect } from "react";

export default function Dashboard() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check initial system preference or class
    if (document.documentElement.classList.contains("dark")) {
      setIsDarkMode(true);
    }
  }, []);

  const toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains("dark")) {
      html.classList.remove("dark");
      setIsDarkMode(false);
    } else {
      html.classList.add("dark");
      setIsDarkMode(true);
    }
  };

  return (
    <div className="min-h-full bg-background-light dark:bg-background-dark text-gray-800 dark:text-gray-200 font-sans p-4 lg:p-8 transition-colors duration-300">

      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Welcome back, Selen Swift</p>
        </div>

        <div className="flex items-center gap-4 lg:gap-6">
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors bg-surface-light dark:bg-surface-dark rounded-full shadow-sm">
            <Search className="w-5 h-5" />
          </button>
          <button className="p-2 relative text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors bg-surface-light dark:bg-surface-dark rounded-full shadow-sm">
            <Bell className="w-5 h-5" />
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background-light dark:border-background-dark"></span>
          </button>

          <div className="hidden md:flex items-center gap-3 pl-2 border-l border-gray-200 dark:border-gray-700">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-dash-primary/20">
              <img
                alt="Manager Profile"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBq6kbb-lT-1PtAbthshi5AoS9Hrs2rjssc0nbFs2CsDAG9nirF_yq3WXYiG7pBUiRx6qKybeX-xU-YPZqC21mPv6SrZ_GdQrF1CALWcN0bLtKuuSRfEuEBu_zYOVRcGjR1C5iNdgcKuMHmJeb187cc0t9BFxJc7aBGsfpptSoHMsB3uIY_P6x49wZqpdtChhiV8jJtcoRD7nESGl93QLmHkEJ_LhTM3PxWbqK_8MVE68M55LzFwVNv6DoymzO5CGAKfF55UPwUnHo"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Selen Swift</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Manager</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 max-w-7xl mx-auto">

        {/* ROW 1 */}
        {/* Card 1: Total Sales */}
        <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-surface-light dark:bg-surface-dark rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total sales</h3>
          </div>
          <div className="flex items-end gap-3 mb-6">
            <span className="text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white">1,200K</span>
            <span className="text-xl text-gray-400 dark:text-gray-500 mb-1">$</span>
            <span className="bg-dash-primary/20 text-dash-primary text-xs font-bold px-2 py-1 rounded-full mb-2">+2.1%</span>
          </div>
          <button className="w-full bg-white dark:bg-white text-gray-900 py-3 px-4 rounded-xl flex items-center justify-between font-semibold hover:bg-gray-50 transition-colors shadow-sm">
            <span>View chart</span>
            <ArrowUp className="w-4 h-4 transform rotate-45" />
          </button>
        </div>

        {/* Card 2: Visitor Online */}
        <div className="col-span-1 md:col-span-2 lg:col-span-5 bg-surface-light dark:bg-surface-dark rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-gray-900 dark:text-white font-medium">Visitor online</h3>
            <button className="text-xs text-gray-500 dark:text-gray-400 hover:text-white bg-gray-100 dark:bg-secondary-dark px-3 py-1 rounded-lg">View</button>
          </div>
          <div className="relative h-32 w-full">
            <div className="absolute top-0 left-1/3 -translate-x-1/2 transform -translate-y-full bg-white text-gray-900 text-xs font-bold px-2 py-1 rounded shadow-lg mb-2">112K</div>
            <div className="absolute top-0 left-1/3 -translate-x-1/2 w-px h-full border-l border-dashed border-gray-500/30"></div>
            <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 300 100">
              <path d="M0,80 C30,75 50,90 80,60 C110,30 130,20 160,50 C190,80 210,60 240,45 C270,30 290,40 300,35" fill="none" stroke="#00D09C" strokeWidth="2"></path>
              <path d="M0,80 C30,75 50,90 80,60 C110,30 130,20 160,50 C190,80 210,60 240,45 C270,30 290,40 300,35 L300,100 L0,100 Z" fill="url(#gradient-visitor)" opacity="0.1"></path>
              <defs>
                <linearGradient id="gradient-visitor" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#00D09C"></stop>
                  <stop offset="100%" stopColor="transparent"></stop>
                </linearGradient>
              </defs>
              <circle cx="106" cy="35" fill="#00D09C" r="4" stroke="#1F1F2B" strokeWidth="2"></circle>
            </svg>
          </div>
          <div className="flex justify-between mt-4 text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
          </div>
        </div>

        {/* Card 3: Market Share */}
        <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-surface-light dark:bg-surface-dark rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-gray-900 dark:text-white font-medium">Market Share</h3>
            <button className="text-xs text-gray-500 dark:text-gray-400 hover:text-white bg-gray-100 dark:bg-secondary-dark px-3 py-1 rounded-lg">View</button>
          </div>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <div className="bg-white dark:bg-white text-gray-900 text-xs font-bold px-2 py-0.5 rounded-md shadow-sm inline-block">25%</div>
              </div>
              <div className="h-10 flex items-end gap-1">
                <div className="w-1/4 h-3 rounded-l-full bg-white dark:bg-white"></div>
                <div className="w-3/4 h-3 rounded-r-full bg-gray-200 dark:bg-secondary-dark relative">
                  <div className="absolute -top-3 left-0 w-px h-6 bg-gray-400/50"></div>
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tiktok</div>
            </div>
            <div className="relative">
              <div className="flex justify-between mb-2 relative z-10">
                <div className="bg-dash-primary text-white text-xs font-bold px-2 py-0.5 rounded-md shadow-sm inline-block">50%</div>
                <div className="text-[10px] text-gray-500">75/100%</div>
              </div>
              <div className="h-3 w-full bg-gray-200 dark:bg-secondary-dark rounded-full overflow-hidden">
                <div className="h-full bg-dash-primary w-1/2 rounded-full"></div>
              </div>
              <div className="absolute top-8 left-[50%] w-px h-4 bg-gray-400/30"></div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">Instagram</div>
            </div>
          </div>
        </div>

        {/* ROW 2 */}
        {/* Column 4: Revenue & Weekly Tasks */}
        <div className="col-span-1 md:col-span-1 lg:col-span-4 flex flex-col gap-6">
          {/* Revenue */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-3xl p-6 shadow-sm flex-1">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-gray-900 dark:text-white font-medium">Revenue</h3>
              <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 dark:bg-secondary-dark px-2 py-1 rounded-lg cursor-pointer">
                <span>Weekly</span>
                <ChevronDown className="w-3 h-3" />
              </div>
            </div>
            <div className="relative h-40 flex items-end justify-between gap-2 px-2">
              {/* Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-gray-500 dark:text-gray-600 pointer-events-none pb-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="border-b border-dashed border-gray-700/30 w-full h-0"></div>
                ))}
              </div>
              {/* Revenue Bars */}
              {[40, 60, 50, 80, 50].map((h, i, arr) => (
                <div key={i} className="w-1/5 relative z-10 group">
                  {i === 3 && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-gray-900 text-xs font-bold px-2 py-1 rounded shadow-sm z-20">$320</div>
                  )}
                  <div
                    className={`w-full rounded-t-lg transition-all ${i === 3 ? 'bg-dash-primary hover:opacity-90' : 'bg-gray-600/30 dark:bg-secondary-dark hover:bg-gray-500 striped-bg'}`}
                    style={{ height: i === 3 ? '8rem' : `${h}%` }} // Simplified height logic
                  ></div>
                  <div className="text-[10px] text-center mt-2 text-gray-500">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Tasks */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-3xl p-6 shadow-sm flex-1 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-gray-900 dark:text-white font-medium">Weekly tasks</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">70<span className="text-dash-primary">%</span></p>
                <p className="text-[10px] text-gray-500 mt-1">Task completed</p>
              </div>
              <div>
                <p className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">32<span className="text-dash-primary">%</span></p>
                <p className="text-[10px] text-gray-500 mt-1">Better then last month</p>
              </div>
            </div>
            <div className="mt-8 flex items-center gap-3 bg-gray-100 dark:bg-secondary-dark/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700/50">
              <Flame className="w-5 h-5 text-orange-500" />
              <p className="text-xs text-gray-600 dark:text-gray-300">Your work balance this week awesome!</p>
            </div>
            {/* User Row */}
            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-600">
                  <img alt="Wade" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBZe_tRJlzPMIzy5hKEPGC9weKXzk3UfQTFI01L5E_xGnL7H7Cc_kEeFrGiLj5CQcxV4jO_AMF3CPfYWvNRstMSAzlzQleYeeQ5ULGbHlBWSYn24-lm9pfsFiGulU8lw_9rytLqlQ1kQI9J5oxPMOw-1lU4iu0LicBOeIRMOGAiOyYV2FXUQ6ypR7ZVno5UMA3Wtly5KUeZNdaNGFJnOhaY5OvnAiEslleG_CyCxZ_hm-LKboRhCggk2zoGclFEaqnINJHVb5Dfnqo" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Wade Warren</p>
                  <div className="flex items-center gap-1 text-[10px] text-gray-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    <span>Now • Google Meet</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="w-8 h-8 rounded-full bg-white dark:bg-white text-gray-900 flex items-center justify-center hover:bg-gray-200">
                  <X className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 rounded-full bg-white dark:bg-white text-gray-900 flex items-center justify-center hover:bg-gray-200">
                  <Video className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Column 5: Retention Rate & Task Status */}
        <div className="col-span-1 md:col-span-1 lg:col-span-4 flex flex-col gap-6">
          {/* Retention */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-3xl p-6 shadow-sm flex-1">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-gray-900 dark:text-white font-medium">Retention rate</h3>
              <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 dark:bg-secondary-dark px-2 py-1 rounded-lg cursor-pointer">
                <span>Weekly</span>
                <ChevronDown className="w-3 h-3" />
              </div>
            </div>
            <div className="relative h-40 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 200 120">
                <path class="dark:stroke-secondary-dark stroke-gray-200" d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="#272735" strokeLinecap="round" strokeWidth="15"></path>
                <path d="M20,100 A80,80 0 0,1 140,40" fill="none" stroke="#00D09C" strokeDasharray="4 4" strokeLinecap="round" strokeWidth="15"></path>
                <text className="text-4xl font-bold fill-gray-900 dark:fill-white" style={{ fontSize: '40px', fontWeight: 'bold' }} textAnchor="middle" x="100" y="90">72<tspan fill="#6B7280" fontSize="20">%</tspan></text>
              </svg>
            </div>
          </div>

          {/* Task Status List */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-3xl p-6 shadow-sm flex-1">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-gray-900 dark:text-white font-medium text-xs">7/10 task completed</h3>
              <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className="w-[70%] h-full bg-dash-primary"></div>
              </div>
            </div>
            <div className="relative h-60">
              {/* Columns Days */}
              <div className="flex justify-between text-[10px] text-gray-500 mb-2 px-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span key={d}>{d}</span>)}
              </div>
              {/* Vertical Lines */}
              <div className="absolute inset-0 top-6 flex justify-between pointer-events-none">
                {[...Array(7)].map((_, i) => <div key={i} className="w-px h-full border-r border-dashed border-gray-700/30"></div>)}
              </div>
              {/* Tasks Blocks */}
              <div className="space-y-3 pt-4 relative">
                <div className="relative h-8">
                  <div className="absolute left-[10%] w-[35%] bg-red-500 text-white text-[10px] font-medium flex items-center px-3 rounded-full shadow-lg h-8 z-10 hover:scale-105 transition-transform cursor-pointer">
                    Project kickoff
                  </div>
                </div>
                {/* More tasks... keeping generic for speed */}
                <div className="relative h-8">
                  <div className="absolute left-[30%] w-[40%] bg-orange-400 text-white text-[10px] font-medium flex items-center px-3 rounded-full shadow-lg h-8 z-10">
                    Biz qty
                    <div className="absolute -top-8 left-1/2 bg-white text-gray-900 px-2 py-1 rounded text-[10px]">$70%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 6: Top Customers */}
        <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-surface-light dark:bg-surface-dark rounded-3xl p-6 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-gray-900 dark:text-white font-medium">Top customers</h3>
            <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 dark:bg-secondary-dark px-2 py-1 rounded-lg">
              <span>Weekly</span>
              <ChevronDown className="w-3 h-3" />
            </div>
          </div>
          {/* Donut Chart */}
          <div className="relative w-64 h-64 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(#3B82F6 75%, transparent 0)' }}></div>
            <div className="absolute inset-2 rounded-full bg-surface-light dark:bg-surface-dark"></div>
            <div className="absolute inset-4 rounded-full" style={{ background: 'conic-gradient(#00D09C 60%, transparent 0)' }}></div>
            <div className="absolute inset-6 rounded-full bg-surface-light dark:bg-surface-dark"></div>
            <div className="absolute inset-8 rounded-full" style={{ background: 'conic-gradient(#EF4444 35%, transparent 0)' }}></div>
            <div className="absolute inset-10 rounded-full bg-surface-light dark:bg-surface-dark flex items-center justify-center flex-col">
              <span className="text-4xl font-bold text-gray-900 dark:text-white">720<span className="text-sm font-normal text-gray-500">K</span></span>
            </div>
          </div>
          {/* Legend */}
          <div className="flex justify-center gap-4 mb-8 text-[10px] text-gray-500">
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-dash-primary"></span> Social app</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Mobile web</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> E-commerce</div>
          </div>
          {/* List */}
          <div className="flex-1 space-y-4">
            {/* Customer 1 */}
            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-secondary-dark/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-600/20 text-purple-400 flex items-center justify-center overflow-hidden">
                  <img alt="Devon" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCqF2UkoxuFkkPnm47ee4J1OIMxAMt2tztXwhTiWuBPyuTdry_RwOUZ-k-Vno83uthpn7ktBs06txn3rVSPaq9AXyaSK9_6YIeHGEDK_XtbZ8xTyUy5JRdGOBcSyt_vI6j5459MNSD0vswOVoxspaScuvez9nKXpqn3XDdR3BcsY2Hbj_GWXVGDbG1nsEJQuN6qWFpeL6TDAwo6j3yhPcYHWH-ogBBHQWoJs6QO5i-vS56rhDR5iJ6v74KZkEbJzCTBfqLyp-2VSw4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Devon Lane</p>
                  <p className="text-xs text-gray-500">Social app</p>
                </div>
              </div>
              <MoreHorizontal className="w-4 h-4 text-gray-400" />
            </div>
            {/* Customer 2 */}
            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-secondary-dark/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden">
                  <img alt="Wade" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBHRd_49A6qK5l3zot8H4cUx0eEYkXAch44CFgDtsQqpl-GwwBreHp6tRZJebglNIZLm2I7stAgHNIsnXuwQDpCcYdLEZg0hOXB-UaHfnsNU0l_1doyWAUuZ6kio_4_oxFREc9aLjQyvmxC6n5dyvRC5qcDBkLjgL41TI_htLWPpe-X-1_RwOp_6Uunnz0owvsUmsTCDH_4LcI5DZdLicOi-C74fK38NK9VDYGLq7lAKd15ZhrlVYJyw8Wbtlutds7NTN61TTsD4MM" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Wade Warren</p>
                  <p className="text-xs text-gray-500">Mobile web</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:border-white">
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Theme Toggle */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={toggleTheme}
          className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        >
          {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
        </button>
      </div>

      <style>{`
          .striped-bg {
              background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.05) 50%, rgba(255, 255, 255, 0.05) 75%, transparent 75%, transparent);
              background-size: 8px 8px;
          }
       `}</style>
    </div>
  );
}
