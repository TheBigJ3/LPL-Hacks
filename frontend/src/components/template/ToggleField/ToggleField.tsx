import ToggleSwitch from "../ToggleSwitch/ToggleSwitch"
import "./.css"

type ToggleFieldProps = {
  title: string
  description: string
  on: boolean
  onChange: (next: boolean) => void
  className?: string
  switchClassName?: string
}

const ToggleField = ({ title, description, on, onChange, className = "", switchClassName = "" }: ToggleFieldProps) => {
  return <div className={`toggle-field ${className}`}>
    <div className="toggle-field__text">
      <span className="toggle-field__title">{title}</span>
      <span className="toggle-field__description">{description}</span>
    </div>
    <ToggleSwitch on={on} onChange={onChange} label={title} className={switchClassName} />
  </div>
}

export default ToggleField
