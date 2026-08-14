import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ theme = "light", ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
        info: <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
        warning: <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
        error: <OctagonX className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin text-primary" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white dark:group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:shadow-black/5 dark:group-[.toaster]:shadow-black/40 font-sans",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "!bg-emerald-50 !text-emerald-950 !border-emerald-200 dark:!bg-emerald-950 dark:!text-emerald-100 dark:!border-emerald-700",
          error:
            "!bg-rose-50 !text-rose-950 !border-rose-200 dark:!bg-rose-950 dark:!text-rose-100 dark:!border-rose-700",
          warning:
            "!bg-amber-50 !text-amber-950 !border-amber-200 dark:!bg-amber-950 dark:!text-amber-100 dark:!border-amber-700",
          info:
            "!bg-blue-50 !text-blue-950 !border-blue-200 dark:!bg-blue-950 dark:!text-blue-100 dark:!border-blue-700",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
