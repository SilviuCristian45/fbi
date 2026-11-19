using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FbiApi.Migrations
{
    /// <inheritdoc />
    public partial class ClearNoImageFileUrl : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Rapoartele fără poză aveau placeholder-ul "no image" și rămâneau Pending la AI.
            migrationBuilder.Sql(@"UPDATE ""LocationWantedPersons"" SET ""FileUrl"" = '' WHERE lower(trim(""FileUrl"")) = 'no image';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
