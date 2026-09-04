import { Badge } from "@mantine/core";

export type MRStatusBadgeProps = {
  status: string;
}

export default function MRStatusBadge({ status }: MRStatusBadgeProps) {
  if (status === "MERGED") {
    return <Badge variant="default">MERGED</Badge>;
  }

  return <Badge
    variant={
      status === "PENDING"
        ? "outline"
        : status === "REVIEWING"
          ? "dot"
          : "filled"
    }
  >
    {status}
  </Badge>
}