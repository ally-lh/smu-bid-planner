import curriculum from "@/data/curriculum.json";
import Planner from "@/components/Planner";
import type { Curriculum } from "@/lib/types";

export default function Page() {
  return <Planner curriculum={curriculum as Curriculum} />;
}
