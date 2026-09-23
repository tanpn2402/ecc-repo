import { Badge } from "@mantine/core";

export type MRStatusBadgeProps = {
  status: string;
  gitlabState?: string;
};

export default function MRStatusBadge({
  status,
  gitlabState,
}: MRStatusBadgeProps) {
  if (gitlabState) {
    if (["merged"].includes(gitlabState)) {
      return (
        <Badge variant="outline" color="green">
          MERGED
        </Badge>
      );
    }
    if (["closed"].includes(gitlabState)) {
      return (
        <Badge variant="outline" color="red">
          CLOSED
        </Badge>
      );
    }
  }

  if (status === "MERGED") {
    return <Badge variant="default">MERGED</Badge>;
  }

  return (
    <Badge
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
  );
}
