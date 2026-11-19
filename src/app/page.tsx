"use client";

import dynamic from "next/dynamic";

const ShowroomApp = dynamic(() => import("./ShowroomApp"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-4">
      <div className="text-2xl font-bold text-amber-400 mb-2">ডিজিটাল সার্ভিস পয়েন্ট - DSP ePOS</div>
      <div className="text-sm text-slate-400">সিস্টেম লোড হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...</div>
    </div>
  ),
});

export default function Page() {
  return <ShowroomApp />;
}
