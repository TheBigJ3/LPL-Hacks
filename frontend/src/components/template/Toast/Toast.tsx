import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./.css";

export default function Toast() {
  return (
    <ToastContainer
      position="top-right"
      autoClose={4500}
      stacked
      newestOnTop
      limit={3}
      closeOnClick={false}
      pauseOnHover
      draggable="touch"
      theme="light"
      aria-label="Notifications"
      style={{
        width: "min(320px, calc(100vw - 32px))",
      }}
      toastClassName="
        grid w-full
        grid-cols-[auto_minmax(0,1fr)_auto]
        items-center gap-3
        min-h-[72px]
        rounded-xl border border-card-outlines-faint
        px-[18px] py-4
        text-center
        text-[14px] leading-[145%] tracking-[-0.28px]
        shadow-[0_17px_22.5px_rgba(0,0,0,0.35)]
        backdrop-blur-xl
      "
    />
  );
}
