namespace ChebsNecromancyMod
{
    public static class RecallMinionsCommand
    {
        public static readonly string name = "recallminions";
        public static readonly string description = "Recall all your summoned minions to your position.";
        public static readonly string usage = "recallminions";

        public static string Execute(params string[] args)
        {
            RecallMinionsEffect.RecallMinions();
            return "";
        }
    }
}


