/** Non-primary displays: plain black with a pointer to the main screen. */
export default function SecondaryLockScreen(): React.JSX.Element {
  return (
    <div className="flex h-screen select-none items-center justify-center bg-black">
      <p className="text-sm text-neutral-600">Complete the task on your main screen.</p>
    </div>
  )
}
