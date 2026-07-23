import { toast as sonnerToast } from "sonner"

export const useToast = () => {
  return {
    toast: (props: { title?: React.ReactNode, description?: React.ReactNode, variant?: "default" | "destructive" }) => {
      if (props.variant === "destructive") {
        sonnerToast.error(props.title, { description: props.description })
      } else {
        sonnerToast(props.title, { description: props.description })
      }
    }
  }
}

export const toast = sonnerToast;
